# 열람실 출석 관리 시스템

열람실 자리를 배정받은 멤버들의 주별 출석을 관리하는 내부 웹 애플리케이션입니다.

**사이트**: https://202-manager.vercel.app

---

## 주요 기능

- **출석 신청** — 이름 선택 + 사진 업로드로 출석 신청
- **출석 현황** — 전체 멤버의 주별 출석 현황 공개 열람
- **관리자 대시보드** — 신청 승인/거부, 수동 출석 추가, Excel 내보내기
- **자리 배정 기준 적용** — 주 4일 미만 출석 시 미인정, 3주 누적 시 위험, 4주 이상 시 자리 반납 대상
- **공휴일 면제** — 공휴일 포함 주는 자동 면제 처리
- **사용자 접근 비밀번호** — 관리자가 설정한 비밀번호 입력 시에만 출석 신청/현황 열람 가능
- **사진 자동 삭제** — 14일 지난 출석 사진 자동 정리 (Vercel Cron)

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| Backend | Node.js + Express |
| Database | Neon PostgreSQL |
| File Storage | Vercel Blob |
| Hosting | Vercel |
| Frontend | Vanilla JS + HTML/CSS |

---

## 페이지 구성

| 경로 | 설명 | 접근 |
|------|------|------|
| `/` | 출석 신청 | 멤버 (비밀번호 설정 시 인증 필요) |
| `/my.html` | 주별 출석 현황 | 멤버 (비밀번호 설정 시 인증 필요) |
| `/admin.html` | 관리자 대시보드 | 관리자 전용 |

---

## 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
node server.js
```

`DATABASE_URL` 환경변수가 없으면 자동으로 로컬 `attendance.json` 파일을 사용합니다.

---

## 환경변수

| 변수명 | 설명 |
|--------|------|
| `DATABASE_URL` | Neon PostgreSQL 연결 문자열 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 토큰 (사진 저장) |
| `ADMIN_PASSWORD` | 초기 관리자 비밀번호 |

---

## 배포

GitHub `main` 브랜치에 푸시하면 Vercel에 자동 배포됩니다.

매일 새벽 2시 Cron Job이 실행되어 14일 지난 출석 사진을 삭제합니다.

---

## 변경 이력

### 2026-06-15
- **버그 수정**: 주 완료 여부 판단이 UTC 기준으로 작동해 KST 일요일 자정~월요일 오전 9시 사이 지난 주가 진행중으로 표시되던 문제 수정
- **패키지 업데이트**: `@neondatabase/serverless` 0.10 → 1.1, `@vercel/blob` 0.27 → 2.4 (보안 취약점 해결), `express` 4 → 5
