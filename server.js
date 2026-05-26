const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = 3000;
const isCloud = !!process.env.BLOB_READ_WRITE_TOKEN;

// 로컬 uploads 디렉토리
const uploadsDir = path.join(__dirname, 'uploads');
if (!isCloud && !fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// 항상 메모리 저장 (Vercel 호환)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('이미지 파일만 업로드 가능합니다.'));
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (!isCloud) app.use('/uploads', express.static(uploadsDir));

// ── Helpers ──────────────────────────────────────────────

async function savePhoto(file) {
  if (!file) return null;
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${ext}`;
  if (isCloud) {
    const { put } = require('@vercel/blob');
    const blob = await put(`checkins/${filename}`, file.buffer, { access: 'public', contentType: file.mimetype });
    return blob.url;
  }
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return filename;
}

function photoSrc(photo_path) {
  if (!photo_path) return null;
  if (photo_path.startsWith('http')) return photo_path;
  return `/uploads/${photo_path}`;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function isWeekComplete(weekStart) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const next = new Date(weekStart + 'T00:00:00'); next.setDate(next.getDate() + 7);
  return today >= next;
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

app.get('/api/members', async (req, res) => {
  try { res.json(await db.getMembers(req.query.all !== 'true')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/members', async (req, res) => {
  const { name, seat_number } = req.body;
  if (!name?.trim() || !seat_number) return res.status(400).json({ error: '이름과 자리번호를 입력해주세요.' });
  try { res.json(await db.addMember(name.trim(), parseInt(seat_number))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/members/:id', async (req, res) => {
  const { name, seat_number, is_active } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (seat_number !== undefined) updates.seat_number = parseInt(seat_number);
  if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
  try { await db.updateMember(parseInt(req.params.id), updates); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Check-ins ────────────────────────────────────────────

app.post('/api/checkin', upload.single('photo'), async (req, res) => {
  const { member_id, checkin_date } = req.body;
  if (!member_id || !checkin_date) return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  if (checkin_date > getTodayKR()) return res.status(400).json({ error: '미래 날짜로는 출석 신청이 불가능합니다.' });
  try {
    const photo_path = await savePhoto(req.file);
    const checkin = await db.addCheckin(parseInt(member_id), checkin_date, photo_path);
    res.json({ id: checkin.id, message: '출석 신청 완료! 관리자 승인 후 반영됩니다.' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/checkins', async (req, res) => {
  try {
    const checkins = await db.getCheckins(req.query.status || null);
    res.json(checkins.map(c => ({ ...c, photo_path: photoSrc(c.photo_path) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/checkins/:id/approve', async (req, res) => {
  try { await db.updateCheckinStatus(parseInt(req.params.id), 'approved', req.body.note || null); res.json({ success: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

app.post('/api/checkins/:id/reject', async (req, res) => {
  try { await db.updateCheckinStatus(parseInt(req.params.id), 'rejected', req.body.note || null); res.json({ success: true }); }
  catch (e) { res.status(404).json({ error: e.message }); }
});

app.delete('/api/checkins/:id', async (req, res) => {
  try { await db.deleteCheckin(parseInt(req.params.id)); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/checkins/manual', async (req, res) => {
  const { member_id, checkin_date } = req.body;
  if (!member_id || !checkin_date) return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  try {
    const checkin = await db.addCheckin(parseInt(member_id), checkin_date, null, 'approved');
    res.json({ id: checkin.id, message: '출석이 추가되었습니다.' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Stats ────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const members = await db.getMembers(false);
    const approved = await db.getApprovedCheckins();

    const byMW = {}, weekSet = new Set();
    for (const c of approved) {
      const week = getWeekStart(c.checkin_date);
      weekSet.add(week);
      const key = `${c.member_id}_${week}`;
      if (!byMW[key]) byMW[key] = [];
      byMW[key].push(c.checkin_date);
    }
    const currentWeek = getWeekStart(getTodayKR());
    weekSet.add(currentWeek);
    const sortedWeeks = Array.from(weekSet).sort();

    const stats = members.map(member => {
      const weekStats = sortedWeeks.map(week => {
        const days = byMW[`${member.id}_${week}`] || [];
        const complete = isWeekComplete(week);
        const status = !complete ? 'ongoing' : days.length >= 4 ? 'recognized' : 'unrecognized';
        return { week, label: formatWeekLabel(week), count: days.length, days, status, isCurrentWeek: week === currentWeek };
      });
      const completed = weekStats.filter(w => w.status !== 'ongoing');
      const unrecognizedCount = completed.filter(w => w.status === 'unrecognized').length;
      return { ...member, weekStats, unrecognizedCount, isAtRisk: unrecognizedCount === 3, shouldRevoke: unrecognizedCount >= 4 };
    });

    res.json({ weeks: sortedWeeks.map(w => ({ week: w, label: formatWeekLabel(w) })), stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n열람실 출석 관리 시스템`);
    console.log(`  멤버 출석 신청 : http://localhost:${PORT}`);
    console.log(`  관리자 대시보드: http://localhost:${PORT}/admin.html\n`);
  });
}
