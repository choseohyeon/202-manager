// 로컬: JSON 파일 / Vercel: Neon PostgreSQL — 환경 자동 감지
const isCloud = !!process.env.DATABASE_URL;
const path = require('path');
const fs = require('fs');

// ── 로컬 JSON 구현 ────────────────────────────────────────

const DB_FILE = path.join(process.cwd(), 'attendance.json');

function loadJSON() {
  if (!fs.existsSync(DB_FILE)) {
    const d = { members: [], checkins: [], _seq: { members: 0, checkins: 0 } };
    fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2));
    return d;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveJSON(d) { fs.writeFileSync(DB_FILE, JSON.stringify(d, null, 2)); }
function nowStr() { return new Date().toLocaleString('sv-SE').replace('T', ' '); }

// ── Neon PostgreSQL 구현 ──────────────────────────────────

let _sql = null;
let _pgReady = false;

async function getSQL() {
  if (!_sql) {
    const { neon } = require('@neondatabase/serverless');
    _sql = neon(process.env.DATABASE_URL);
  }
  if (!_pgReady) {
    await _sql`CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL,
      seat_number INTEGER NOT NULL UNIQUE, is_active SMALLINT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    await _sql`CREATE TABLE IF NOT EXISTS checkins (
      id SERIAL PRIMARY KEY, member_id INTEGER NOT NULL,
      checkin_date TEXT NOT NULL, photo_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending', note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(member_id, checkin_date)
    )`;
    await _sql`CREATE TABLE IF NOT EXISTS holidays (
      id SERIAL PRIMARY KEY, date TEXT NOT NULL UNIQUE,
      note TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    _pgReady = true;
  }
  return _sql;
}

// ── 통합 비동기 인터페이스 ────────────────────────────────

async function getMembers(activeOnly = true) {
  if (isCloud) {
    const sql = await getSQL();
    return activeOnly
      ? await sql`SELECT * FROM members WHERE is_active=1 ORDER BY seat_number`
      : await sql`SELECT * FROM members ORDER BY seat_number`;
  }
  const d = loadJSON();
  const list = activeOnly ? d.members.filter(m => m.is_active) : d.members;
  return [...list].sort((a, b) => a.seat_number - b.seat_number);
}

async function addMember(name, seat_number) {
  if (isCloud) {
    const sql = await getSQL();
    try {
      const r = await sql`INSERT INTO members(name,seat_number) VALUES(${name},${seat_number}) RETURNING *`;
      return r[0];
    } catch (e) {
      if (e.code === '23505') throw new Error('이미 사용 중인 자리번호입니다.');
      throw e;
    }
  }
  const d = loadJSON();
  if (d.members.some(m => m.seat_number === seat_number)) throw new Error('이미 사용 중인 자리번호입니다.');
  const member = { id: ++d._seq.members, name, seat_number, is_active: 1, created_at: nowStr() };
  d.members.push(member);
  saveJSON(d);
  return member;
}

async function updateMember(id, updates) {
  if (isCloud) {
    const sql = await getSQL();
    try {
      if (updates.name !== undefined) await sql`UPDATE members SET name=${updates.name} WHERE id=${id}`;
      if (updates.seat_number !== undefined) await sql`UPDATE members SET seat_number=${updates.seat_number} WHERE id=${id}`;
      if (updates.is_active !== undefined) await sql`UPDATE members SET is_active=${updates.is_active} WHERE id=${id}`;
    } catch (e) {
      if (e.code === '23505') throw new Error('이미 사용 중인 자리번호입니다.');
      throw e;
    }
    return;
  }
  const d = loadJSON();
  const member = d.members.find(m => m.id === id);
  if (!member) throw new Error('멤버를 찾을 수 없습니다.');
  if (updates.seat_number !== undefined && d.members.some(m => m.seat_number === updates.seat_number && m.id !== id))
    throw new Error('이미 사용 중인 자리번호입니다.');
  Object.assign(member, updates);
  saveJSON(d);
}

async function addCheckin(member_id, checkin_date, photo_path = null, status = 'pending') {
  const errMsg = status === 'approved' ? '이미 해당 날짜에 출석이 있습니다.' : '이미 해당 날짜에 출석 신청이 되어 있습니다.';
  if (isCloud) {
    const sql = await getSQL();
    try {
      const r = await sql`INSERT INTO checkins(member_id,checkin_date,photo_path,status)
        VALUES(${member_id},${checkin_date},${photo_path},${status}) RETURNING *`;
      return r[0];
    } catch (e) {
      if (e.code === '23505') throw new Error(errMsg);
      throw e;
    }
  }
  const d = loadJSON();
  if (d.checkins.find(c => c.member_id === member_id && c.checkin_date === checkin_date)) throw new Error(errMsg);
  const checkin = { id: ++d._seq.checkins, member_id, checkin_date, photo_path, status, note: null, created_at: nowStr() };
  d.checkins.push(checkin);
  saveJSON(d);
  return checkin;
}

async function getCheckins(statusFilter = null) {
  if (isCloud) {
    const sql = await getSQL();
    return statusFilter
      ? await sql`SELECT c.*,m.name,m.seat_number FROM checkins c JOIN members m ON c.member_id=m.id WHERE c.status=${statusFilter} ORDER BY c.created_at DESC`
      : await sql`SELECT c.*,m.name,m.seat_number FROM checkins c JOIN members m ON c.member_id=m.id ORDER BY c.created_at DESC`;
  }
  const d = loadJSON();
  const checkins = statusFilter ? d.checkins.filter(c => c.status === statusFilter) : d.checkins;
  return checkins
    .map(c => { const m = d.members.find(m => m.id === c.member_id); return { ...c, name: m?.name ?? '?', seat_number: m?.seat_number ?? '?' }; })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function updateCheckinStatus(id, status, note = null) {
  if (isCloud) {
    const sql = await getSQL();
    await sql`UPDATE checkins SET status=${status},note=${note} WHERE id=${id}`;
    return;
  }
  const d = loadJSON();
  const c = d.checkins.find(c => c.id === id);
  if (!c) throw new Error('신청을 찾을 수 없습니다.');
  c.status = status;
  if (note !== null) c.note = note;
  saveJSON(d);
}

async function deleteCheckin(id) {
  if (isCloud) {
    const sql = await getSQL();
    await sql`DELETE FROM checkins WHERE id=${id}`;
    return;
  }
  const d = loadJSON();
  d.checkins = d.checkins.filter(c => c.id !== id);
  saveJSON(d);
}

async function getApprovedCheckins() {
  if (isCloud) {
    const sql = await getSQL();
    return await sql`SELECT * FROM checkins WHERE status='approved' ORDER BY checkin_date`;
  }
  const d = loadJSON();
  return d.checkins.filter(c => c.status === 'approved').sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));
}

async function getHolidays() {
  if (isCloud) {
    const sql = await getSQL();
    return await sql`SELECT * FROM holidays ORDER BY date`;
  }
  const d = loadJSON();
  return (d.holidays || []).sort((a, b) => a.date.localeCompare(b.date));
}

async function addHoliday(date, note = '') {
  if (isCloud) {
    const sql = await getSQL();
    try {
      const r = await sql`INSERT INTO holidays(date,note) VALUES(${date},${note}) RETURNING *`;
      return r[0];
    } catch (e) {
      if (e.code === '23505') throw new Error('이미 등록된 날짜입니다.');
      throw e;
    }
  }
  const d = loadJSON();
  if (!d.holidays) d.holidays = [];
  if (d.holidays.find(h => h.date === date)) throw new Error('이미 등록된 날짜입니다.');
  if (!d._seq.holidays) d._seq.holidays = 0;
  const holiday = { id: ++d._seq.holidays, date, note, created_at: nowStr() };
  d.holidays.push(holiday);
  saveJSON(d);
  return holiday;
}

async function deleteHoliday(id) {
  if (isCloud) {
    const sql = await getSQL();
    await sql`DELETE FROM holidays WHERE id=${id}`;
    return;
  }
  const d = loadJSON();
  if (!d.holidays) return;
  d.holidays = d.holidays.filter(h => h.id !== id);
  saveJSON(d);
}

async function deleteMember(id) {
  if (isCloud) {
    const sql = await getSQL();
    await sql`DELETE FROM checkins WHERE member_id=${id}`;
    await sql`DELETE FROM members WHERE id=${id}`;
    return;
  }
  const d = loadJSON();
  d.checkins = d.checkins.filter(c => c.member_id !== id);
  d.members = d.members.filter(m => m.id !== id);
  saveJSON(d);
}

module.exports = { getMembers, addMember, updateMember, deleteMember, addCheckin, getCheckins, updateCheckinStatus, deleteCheckin, getApprovedCheckins, getHolidays, addHoliday, deleteHoliday };
