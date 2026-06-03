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

- `/` (index.html): 사용자가 이름 선택 + 사진 업로드로 출석 신청. 헤더 타이틀: "열람실 출석 신청"
- `/my.html`: 전체 사용자 주별 출석 현황 공개 열람. 헤더 타이틀: "열람실 출석 현황"
- `/admin.html`: 관리자 전용 — 헤더 아래 sub-nav 탭 4개로 구성:
  - **대기 요청**: 출석 신청 승인/거부/삭제
  - **출석 현황**: 주별 출석 현황 테이블 + Excel 내보내기
  - **사용자 관리**: 사용자 목록 → 사용자 추가 → 수동 출석 추가 → 공휴일 관리 (이 순서)
  - **설정**: 사용자 접근 비밀번호 관리 + 관리자 비밀번호 변경

## 인증 방식

### 관리자 인증
- 관리자 비밀번호 → HMAC-SHA256 토큰 발급 (24시간 유효)
- `sessionStorage`에 토큰 저장, 모든 관리자 API에 `requireAuth` 미들웨어
- 비밀번호는 `scrypt` 해시로 DB에 저장

### 사용자 접근 비밀번호 (멤버 인증)
- 관리자가 admin.html 설정 탭에서 사용자 접근 비밀번호를 설정하면 index.html·my.html 접근 시 비밀번호 입력 필요
- 인증 성공 시 HMAC-SHA256 토큰 발급 (30일 유효), `localStorage`에 저장 → 카톡 인앱브라우저에서도 유지
- DB 설정 키: `member_password`(해시), `member_session_secret`(토큰 서명용)
- `requireMemberAuth` 미들웨어: `member_password` 미설정 시 통과, 관리자 토큰도 허용
- 관련 API:
  - `GET /api/member/status` — 비밀번호 설정 여부 반환 (`{ required: true/false }`)
  - `POST /api/member/verify` — 비밀번호 검증 후 토큰 발급
  - `POST /api/admin/set-member-password` — 비밀번호 설정/해제 (관리자 전용)
- 적용 엔드포인트: `GET /api/members`, `POST /api/checkin`, `GET /api/stats`
- 오버레이 표시 방식: 토큰 없으면 즉시 오버레이 표시 → 백그라운드에서 `/api/member/status` 확인 → 불필요하면 자동 닫힘 (지연 없음)
- 설정 탭 "사용자 접근 비밀번호" 섹션에서 현재 설정 상태(🔒/🔓) 확인 가능

## 출석 인정 기준

- 주 4일 이상 출석 → 인정
- 미인정 3주 누적 → 위험 (노란색 행 표시)
- 미인정 4주 이상 → 박탈 대상 (빨간색 행 표시)
- 공휴일 포함 주 → 자동 면제

## CSS 설계

### 디자인 토큰 (`style.css` `:root`)

주요 토큰값:
- `--primary: #37352f` (Notion Black — 버튼·탭·포커스에 사용)
- `--bg: #f7f6f5` (따뜻한 오프화이트 배경, Notion 스타일)
- `--border: #e9e9e7` (따뜻한 보더)
- `--warning: #92400e` (WCAG AA 대비 확보를 위해 앰버-800 사용)
- `--exempted: #4b5563` / `--exempted-bg: #f1f0ef` (면제 상태 — 슬레이트)
- `--gray` 토큰 제거 — `--text-secondary`로 통합

### 버튼 스타일
- 모든 버튼: **아웃라인** 스타일 (투명 배경 + 2px solid 테두리 + 색상 텍스트)
- 호버 시 해당 색상의 연한 배경으로 채워짐
- `.btn-ghost`: 연한 스타일 (`color: #9b9a97`, `border: 2px solid #c4c0ba`) — 보조 액션용. WCAG 대비 기준 미달이지만 관리자 전용 UI라 의도적으로 허용

### 탭 (admin.html)
- 헤더 아래 `.sub-nav`로 분리된 언더라인 탭 (pill 탭 아님)
- `position: sticky; top: 56px` — 스크롤 시 고정
- 활성 탭: `::after` 가상 요소로 밑줄 표시 (border-bottom 트릭 미사용)
- `overflow-x: auto` — 모바일 좁은 화면 대응

### CSS 버전 캐시 버스팅
- `admin.html`에서 `style.css?v=N` 형태로 관리
- **style.css 수정 시 반드시 N 증가** (현재 v=41)
- `transition: all` 사용 금지 — 특정 속성만 명시

### 접근성
- `html { scrollbar-gutter: stable }` — 탭 전환 시 레이아웃 시프트 방지
- `prefers-reduced-motion` 미디어쿼리 추가
- 멤버 인증 오버레이(index.html, my.html): 포커스 트랩 구현
- `#result` (index.html): `aria-live="polite"` — 폼 제출 결과 스크린리더 고지
- 장식용 이모지 없음 (헤딩, 빈 상태 모두 제거)

## 주요 결정사항 / 알려진 이슈

- **다크모드 불필요**: 이 프로젝트에서는 다크모드 지원 안 함
- **Safari 날짜 입력 높이**: `input[type="date"]`가 Safari에서 다른 `.form-control`보다 높게 렌더링됨. CSS로 해결 불가 → JS로 해결: `syncDateInputHeights()` 함수가 `select.form-control` 높이를 측정해 date input에 동일하게 적용 (`pointer: fine` 기기만)
- **사진 자동 삭제**: Vercel cron이 매일 새벽 2시에 `/api/cleanup` 호출 → 14일 지난 사진 Blob에서 삭제
- **사용자 인증 토큰 저장소**: `localStorage` 사용 (카톡 인앱브라우저에서 `sessionStorage`는 탭 닫히면 초기화되므로 부적합)
- **새로고침 버튼 없음**: 대기 요청은 30초 자동 폴링(`loadSummary` interval), 나머지는 수동 페이지 새로고침으로 충분
- **summary 카드 없음**: 대기 수는 탭 배지, 위험/박탈은 테이블 행 색상으로 표시 — 별도 집계 카드 불필요
- **비활성화 vs 삭제**: 비활성화(`is_active: 0`)는 기록 보존 + 재활성화 가능. 삭제는 출석 기록까지 완전 제거. 자리 박탈 처리 시 비활성화 사용

## 로컬 개발

```bash
npm install
node server.js   # http://localhost:3000
```

`DATABASE_URL` 없으면 자동으로 `attendance.json` 파일 사용.
