const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('이미지 파일만 업로드 가능합니다.'));
  }
});

// ── Helpers ──────────────────────────────────────────────

async function savePhoto(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const blob = await put(`checkins/${filename}`, file.buffer, {
      access: 'public', contentType: file.mimetype
    });
    return blob.url;
  } else {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
    fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
    return filename;
  }
}

function photoSrc(p) {
  if (!p) return null;
  return p.startsWith('http') ? p : `/uploads/${p}`;
}

function getWeekDates(weekStart) {
  const dates = [];
  const d = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const c = new Date(d); c.setDate(c.getDate() + i);
    dates.push(c.toISOString().split('T')[0]);
  }
  return dates;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function isWeekComplete(weekStart) {
  const d = new Date(weekStart + 'T00:00:00'); d.setDate(d.getDate() + 7);
  return getTodayKR() >= d.toISOString().split('T')[0];
}

function formatWeekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  const e = new Date(d); e.setDate(e.getDate() + 6);
  return `${d.getMonth()+1}/${d.getDate()}~${e.getMonth()+1}/${e.getDate()}`;
}

function getTodayKR() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// ── Members ──────────────────────────────────────────────

app.get('/api/members', requireMemberAuth, async (req, res) => {
  try { res.json(await db.getMembers(req.query.all !== 'true')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', requireAuth, async (req, res) => {
  const { name, seat_number } = req.body;
  if (!name?.trim() || !seat_number) return res.status(400).json({ error: '이름과 자리번호를 입력해주세요.' });
  try { res.json(await db.addMember(name.trim(), parseInt(seat_number))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/members/:id', requireAuth, async (req, res) => {
  const { name, seat_number, is_active } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (seat_number !== undefined) updates.seat_number = parseInt(seat_number);
  if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
  try { await db.updateMember(parseInt(req.params.id), updates); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Check-ins ────────────────────────────────────────────

app.post('/api/checkin', requireMemberAuth, upload.single('photo'), async (req, res) => {
  const { member_id, checkin_date } = req.body;
  if (!member_id || !checkin_date) return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  if (checkin_date !== getTodayKR()) return res.status(400).json({ error: '당일 날짜로만 출석 신청이 가능합니다.' });
  try {
    const photo_path = await savePhoto(req.file);
    const checkin = await db.addCheckin(parseInt(member_id), checkin_date, photo_path);
    res.json({ id: checkin.id, message: '출석 신청 완료! 관리자 승인 후 반영됩니다.' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/checkins', requireAuth, async (req, res) => {
  try {
    const checkins = await db.getCheckins(req.query.status || null);
    res.json(checkins.map(c => ({ ...c, photo_path: photoSrc(c.photo_path) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/checkins/:id/approve', requireAuth, async (req, res) => {
  try { await db.updateCheckinStatus(parseInt(req.params.id), 'approved', null); res.json({ success: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});


app.delete('/api/checkins/:id', requireAuth, async (req, res) => {
  try { await db.deleteCheckin(parseInt(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/checkins/manual', requireAuth, async (req, res) => {
  const { member_id, checkin_date } = req.body;
  if (!member_id || !checkin_date) return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  try {
    const checkin = await db.addCheckin(parseInt(member_id), checkin_date, null, 'approved');
    res.json({ id: checkin.id, message: '출석이 추가되었습니다.' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Stats ────────────────────────────────────────────────

app.get('/api/stats', requireMemberAuth, async (req, res) => {
  try {
    const members = await db.getMembers(false);
    const approved = await db.getApprovedCheckins();
    const holidays = await db.getHolidays();
    const holidaySet = new Set(holidays.map(h => h.date));

    const byMW = {}, weekSet = new Set();
    for (const c of approved) {
      const week = getWeekStart(c.checkin_date);
      weekSet.add(week);
      const key = `${c.member_id}_${week}`;
      if (!byMW[key]) byMW[key] = [];
      byMW[key].push({ date: c.checkin_date, id: c.id });
    }
    const currentWeek = getWeekStart(getTodayKR());
    weekSet.add(currentWeek);
    const sortedWeeks = Array.from(weekSet).sort();

    const stats = members.map(member => {
      const memberFirstWeek = sortedWeeks.find(w => byMW[`${member.id}_${w}`]?.length > 0) || currentWeek;
      const weekStats = sortedWeeks.map(week => {
        const days = byMW[`${member.id}_${week}`] || [];
        const complete = isWeekComplete(week);
        const hasHoliday = getWeekDates(week).some(d => holidaySet.has(d));
        let status;
        if (week < memberFirstWeek) status = 'na';
        else if (hasHoliday) status = 'exempted';
        else if (!complete) status = 'ongoing';
        else if (days.length >= 4) status = 'recognized';
        else status = 'unrecognized';
        return { week, label: formatWeekLabel(week), count: days.length, days, status, isCurrentWeek: week === currentWeek, hasHoliday };
      });
      const completed = weekStats.filter(w => w.status !== 'ongoing' && w.status !== 'exempted' && w.status !== 'na');
      const unrecognizedCount = completed.filter(w => w.status === 'unrecognized').length;
      return { ...member, weekStats, unrecognizedCount, isAtRisk: unrecognizedCount === 3, shouldRevoke: unrecognizedCount >= 4 };
    });

    res.json({ weeks: sortedWeeks.map(w => ({ week: w, label: formatWeekLabel(w) })), stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/members/:id', requireAuth, async (req, res) => {
  try { await db.deleteMember(parseInt(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Holidays ─────────────────────────────────────────────

app.get('/api/holidays', async (req, res) => {
  try { res.json(await db.getHolidays()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/holidays', requireAuth, async (req, res) => {
  const { date, note } = req.body;
  if (!date) return res.status(400).json({ error: '날짜를 입력해주세요.' });
  try { res.json(await db.addHoliday(date, note || '')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/holidays/:id', requireAuth, async (req, res) => {
  try { await db.deleteHoliday(parseInt(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin auth ───────────────────────────────────────────

async function getSessionSecret() {
  let secret = await db.getSetting('session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    await db.setSetting('session_secret', secret);
  }
  return secret;
}

function generateToken(secret) {
  const ts = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret).update(ts).digest('hex');
  return `${ts}.${hmac}`;
}

function verifyToken(token, secret) {
  try {
    const [ts, hmac] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return false;
    if (Date.now() - parseInt(ts) > 24 * 60 * 60 * 1000) return false;
    return true;
  } catch { return false; }
}

async function getMemberSessionSecret() {
  let secret = await db.getSetting('member_session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    await db.setSetting('member_session_secret', secret);
  }
  return secret;
}

function verifyMemberToken(token, secret) {
  try {
    const [ts, hmac] = token.split('.');
    const expected = crypto.createHmac('sha256', secret).update(ts).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) return false;
    if (Date.now() - parseInt(ts) > 30 * 24 * 60 * 60 * 1000) return false;
    return true;
  } catch { return false; }
}

async function requireMemberAuth(req, res, next) {
  const memberPw = await db.getSetting('member_password');
  if (!memberPw) return next();
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'member_auth_required' });
  const token = auth.slice(7);
  try {
    const adminSecret = await getSessionSecret();
    if (verifyToken(token, adminSecret)) return next();
    const memberSecret = await getMemberSessionSecret();
    if (verifyMemberToken(token, memberSecret)) return next();
    return res.status(401).json({ error: 'member_auth_required' });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

async function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: '인증이 필요합니다.' });
  try {
    const secret = await getSessionSecret();
    if (!verifyToken(auth.slice(7), secret)) return res.status(401).json({ error: '인증이 만료되었습니다. 다시 로그인해주세요.' });
    next();
  } catch (e) { res.status(500).json({ error: e.message }); }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
  } catch { return false; }
}

app.post('/api/admin/verify', async (req, res) => {
  const { password } = req.body;
  try {
    const stored = await db.getSetting('admin_password');
    const valid = stored ? verifyPassword(password, stored) : password === process.env.ADMIN_PASSWORD;
    if (!valid) return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
    if (!stored && !process.env.ADMIN_PASSWORD) return res.status(500).json({ error: '서버 설정 오류' });
    const secret = await getSessionSecret();
    const token = generateToken(secret);
    res.json({ ok: true, token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  const { current, next } = req.body;
  if (!current || !next) return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
  if (next.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
  try {
    const stored = await db.getSetting('admin_password');
    const valid = stored ? verifyPassword(current, stored) : current === process.env.ADMIN_PASSWORD;
    if (!valid) return res.status(401).json({ error: '현재 비밀번호가 틀렸습니다.' });
    await db.setSetting('admin_password', hashPassword(next));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Photo cleanup (cron: daily, delete photos older than 14 days) ────────────

app.get('/api/cleanup', async (req, res) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.json({ skipped: true });
  try {
    const { del } = require('@vercel/blob');
    const rows = await db.getOldCheckinPhotos(14);
    let deleted = 0;
    for (const row of rows) {
      try {
        await del(row.photo_path);
        await db.clearCheckinPhoto(row.id);
        deleted++;
      } catch (e) {
        console.error('cleanup error:', row.id, e.message);
      }
    }
    res.json({ deleted, checked: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Member auth ───────────────────────────────────────────

app.get('/api/member/status', async (req, res) => {
  try {
    const memberPw = await db.getSetting('member_password');
    res.json({ required: !!memberPw });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/member/verify', async (req, res) => {
  const { password } = req.body;
  try {
    const stored = await db.getSetting('member_password');
    if (!stored) return res.json({ ok: true, token: null });
    if (!verifyPassword(password, stored)) return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
    const secret = await getMemberSessionSecret();
    const ts = Date.now().toString();
    const hmac = crypto.createHmac('sha256', secret).update(ts).digest('hex');
    res.json({ ok: true, token: `${ts}.${hmac}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/set-member-password', requireAuth, async (req, res) => {
  const { password } = req.body;
  try {
    if (!password || !password.trim()) {
      await db.setSetting('member_password', '');
      return res.json({ ok: true });
    }
    if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    await db.setSetting('member_password', hashPassword(password));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Health check ─────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: !!process.env.DATABASE_URL, blob: !!process.env.BLOB_READ_WRITE_TOKEN });
});

module.exports = app;
