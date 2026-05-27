# 열람실 출석 관리 시스템

열람실 자리 배정 멤버들의 주별 출석을 관리하는 웹 애플리케이션.

## 기술 스택

- **Backend**: Node.js + Express (`api/index.js`)
- **Database**: Neon PostgreSQL (운영) / 로컬 JSON 파일 `attendance.json` (개발)
- **File Storage**: Vercel Blob (출석 사진)
- **Hosting**: Vercel (GitHub 연동 자동 배포)
- **Frontend**: Vanilla JS + HTML/CSS (프레임워크 없음)

## 외부 서비스

| 서비스 | 용도 | 주소 |
|--------|------|------|
| Vercel | 배포 / 호스팅 | vercel.com |
| Neon | PostgreSQL DB | neon.tech |
| Vercel Blob | 출석 사진 저장 | vercel.com/storage |

환경변수: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_PASSWORD`

## 파일 구조

```
manager/
├── api/index.js       # Express API 전체 (라우터, 인증, 사진 업로드)
├── db.js              # DB 추상화 (Neon / 로컬 JSON 듀얼 모드)
├── server.js          # 로컬 개발 서버
├── vercel.json        # Vercel 배포 설정 + cron
└── public/
    ├── index.html     # 출석 신청 페이지 (사용자용)
    ├── my.html        # 주별 출석 현황 공개 페이지
    ├── admin.html     # 관리자 대시보드 (로그인 필요)
    └── style.css      # 공통 CSS (디자인 토큰 기반)
```

## 페이지별 역할

- `/` (index.html): 사용자가 이름 선택 + 사진 업로드로 출석 신청
- `/my.html`: 전체 사용자 주별 출석 현황 공개 열람
- `/admin.html`: 관리자 전용 — 신청 승인/거부, 수동 출석 추가, 사용자 관리, 공휴일 설정

## 인증 방식

- 관리자 비밀번호 → HMAC-SHA256 토큰 발급 (24시간 유효)
- `sessionStorage`에 토큰 저장, 모든 관리자 API에 `requireAuth` 미들웨어
- 비밀번호는 `scrypt` 해시로 DB에 저장

## 출석 인정 기준

- 주 4일 이상 출석 → 인정
- 미인정 3주 누적 → 위험 (노란색 행 표시)
- 미인정 4주 이상 → 박탈 대상 (빨간색 행 표시)
- 공휴일 포함 주 → 자동 면제

## CSS 설계

- 디자인 토큰: `style.css` `:root`에 전부 정의 (`--primary`, `--success`, `--danger` 등)
- CSS 버전 캐시 버스팅: `admin.html`에서 `style.css?v=N` 형태로 관리 — style.css 수정 시 반드시 N 증가
- `transition: all` 사용 금지 — 특정 속성만 명시

## 주요 결정사항 / 알려진 이슈

- **다크모드 불필요**: 이 프로젝트에서는 다크모드 지원 안 함
- **Safari 날짜 입력 높이**: `input[type="date"]`가 Safari에서 다른 `.form-control`보다 높게 렌더링됨. CSS로 해결 불가 → JS로 해결: `syncDateInputHeights()` 함수가 `select.form-control` 높이를 측정해 date input에 동일하게 적용 (`pointer: fine` 기기만)
- **사진 자동 삭제**: Vercel cron이 매일 새벽 2시에 `/api/cleanup` 호출 → 14일 지난 사진 Blob에서 삭제

## 로컬 개발

```bash
npm install
node server.js   # http://localhost:3000
```

`DATABASE_URL` 없으면 자동으로 `attendance.json` 파일 사용.
