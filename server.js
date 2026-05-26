// 로컬 개발용 서버 (Vercel에서는 api/index.js 사용)
const app = require('./api/index');
const express = require('express');
const path = require('path');

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n열람실 출석 관리 시스템`);
  console.log(`  멤버 출석 신청 : http://localhost:${PORT}`);
  console.log(`  관리자 대시보드: http://localhost:${PORT}/admin.html\n`);
});
