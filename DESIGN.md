# UI/UX 가이드라인

이 문서는 열람실 출석 관리 시스템을 만들며 정립한 디자인 원칙과 패턴을 기록한 것입니다.
비슷한 스타일의 관리 도구(admin tool) / 내부 서비스를 만들 때 참고할 수 있습니다.

---

## 디자인 철학

### 핵심 원칙
- **색을 적게 쓸수록 색이 더 의미있어 보인다** — Notion 스타일. 강조가 필요한 곳에만 색을 써야 효과가 있다.
- **기능 우선, 장식 금지** — 모든 UI 요소는 기능적 이유가 있어야 한다. 이유 없는 색상·아이콘·애니메이션은 제거.
- **AI 슬롭 회피** — "AI가 자동으로 만들어낸 느낌"을 주는 패턴을 의도적으로 피한다.
- **내부 도구의 밀도** — 내부 관리 도구는 정보 밀도를 높이고 시각적 무게를 줄이는 방향이 적합하다.

### AI 슬롭이란
다음 패턴이 2개 이상 겹치면 AI 생성 UI처럼 보인다:
- Tailwind Indigo (#4f46e5) 계열 Primary 색상
- 솔리드 필 버튼 (배경 꽉 찬 버튼)
- Pill 형태 탭 (배경 채워지는 탭)
- 메트릭 카드 그리드 (숫자 + 라벨 카드 4개 나열)
- 헤딩에 이모지 (📚 열람실...)
- 빈 상태에 이모지 아이콘 (📊 불러오는 중...)
- 그라데이션 텍스트
- 글래스모피즘

---

## 색상 시스템

### Primary 색상 철학
- **Notion Black (`#37352f`)** — 따뜻한 다크. AI 기본값인 인디고/바이올렛 계열을 피한다.
- Primary는 버튼 테두리·텍스트, 활성 탭 밑줄, 인풋 포커스 링에만 사용.
- 헤더 제목, 일반 텍스트에는 Primary 색상을 쓰지 않는다.

### 배경 색상
- **페이지 배경**: `#f7f6f5` (따뜻한 오프화이트) — 순수 흰색이나 차가운 회색 대신 Notion 스타일의 따뜻한 배경
- **카드/서피스**: `#ffffff`
- **테이블 헤더, 입력 비활성**: `#f0efed`

### 시맨틱 색상 토큰
```css
--primary:      #37352f;   /* Notion Black */
--primary-bg:   #edece9;   /* 버튼 호버 배경 */
--success:      #16a34a;   /* 인정, 활성 */
--success-bg:   #dcfce7;
--warning:      #92400e;   /* 미인정, 위험 — WCAG AA 대비 확보 위해 amber-800 */
--warning-bg:   #fef3c7;
--danger:       #dc2626;   /* 거부, 삭제 */
--danger-bg:    #fee2e2;
--ongoing:      #1e40af;   /* 진행중 — blue-800, WCAG AA 통과 */
--ongoing-bg:   #dbeafe;
--exempted:     #4b5563;   /* 면제 — 슬레이트 (중립 상태) */
--exempted-bg:  #f1f0ef;
--bg:           #f7f6f5;
--border:       #e9e9e7;
--text:         #111827;
--text-secondary: #6b7280;
```

### 색상 대비 원칙
- 텍스트: WCAG AA 기준 **4.5:1** 이상
- UI 컴포넌트 경계(버튼 테두리 등): **3:1** 이상
- 배지 텍스트는 작은 크기(11px)라 대비에 특히 주의

---

## 컴포넌트 패턴

### 버튼

**아웃라인 스타일** — 배경 없이 테두리만. 내부 도구에 잘 어울리는 차분한 스타일.

```css
.btn-primary { background: transparent; color: var(--primary); border: 2px solid var(--primary); }
.btn-success { background: transparent; color: var(--success); border: 2px solid var(--success); }
.btn-danger  { background: transparent; color: var(--danger);  border: 2px solid var(--danger);  }
.btn-ghost   { background: transparent; color: #9b9a97;        border: 2px solid #c4c0ba;        }
```

- 호버 시 해당 색상의 연한 배경(`--primary-bg` 등)으로 채워짐
- `.btn-ghost`는 보조 액션(취소, 비활성화 등)에 사용 — 의도적으로 시각적 무게를 낮춤
- 버튼 텍스트에 이모지 접두사 사용 금지

**터치 타겟**: `@media (pointer: coarse)` 에서 `.btn`, `.btn-sm` 모두 `min-height: 44px`

### 탭 네비게이션

**언더라인 탭 (sub-nav)** — Pill/카드 탭 대신 밑줄 방식. 더 실용적이고 AI 느낌이 덜함.

```
헤더 (타이틀 + 우측 정보)
──────────────────────────── ← 헤더 하단 border
대기 요청  출석 현황  사용자 관리  설정
──────────────────────────── ← 활성 탭 밑줄 (::after 사용)
컨텐츠
```

- 헤더와 sub-nav를 시각적으로 분리하되 배경·border를 공유해 하나의 영역처럼 보이게
- `position: sticky; top: 56px` — 스크롤 시 탭 고정
- 활성 탭은 `border-bottom` + `margin-bottom: -1px` 트릭 대신 `::after` 가상 요소 사용 (더 안정적)
- 탭 텍스트는 `justify-content: center`로 중앙 정렬

### 헤더

```
[타이틀]                    [보조 정보]
```

- 헤더 타이틀: `color: var(--text)` — Primary 색상 사용 금지
- 이모지 없이 텍스트만
- 높이 56px 고정

### 카드

```css
.card {
  background: var(--white);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
  padding: 24px;
}
```

- 중첩 카드 금지 (카드 안에 카드)
- 카드 그리드로 숫자 지표 나열하지 않기 (메트릭 카드 그리드 = AI 슬롭)

### 배지 (상태 표시)

```css
.badge { font-size: 11~12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
```

- 시맨틱 색상만 사용 (성공/경고/위험/면제/진행중)
- 배지 텍스트는 작으므로 대비 비율 반드시 확인

### 빈 상태 (Empty State)

```html
<!-- ✅ -->
<div class="empty-state"><p>대기 중인 신청이 없습니다.</p></div>

<!-- ❌ AI 슬롭 -->
<div class="empty-state"><div class="icon">✅</div><p>대기 중인 신청이 없습니다.</p></div>
```

- 이모지 아이콘 없이 텍스트만

---

## 타이포그래피

### 폰트
```css
font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
```
- 시스템 폰트 스택 — 한국어 최적화
- 외부 폰트 로드 없음 (성능, FOUT 방지)

### 기본 크기
- Body: `15px`
- 인풋: `16px` (iOS 자동 줌 방지)
- 배지/보조: `11~13px`
- 섹션 타이틀: `16px / 700`
- 페이지 헤더 h1: `17px / 700`

---

## 레이아웃

### 컨테이너
- 관리자 페이지: `max-width: 1200px`
- 사용자 페이지(폼): `max-width: 480px`

### 간격
- 섹션 간: `24px`
- 카드 패딩: `24px`
- 폼 그룹: `20px margin-bottom`

### 반응형
- 모바일 브레이크포인트: `600px`
- 테이블: `overflow-x: auto` + `position: sticky` 첫 열

---

## 접근성

- `scrollbar-gutter: stable` — 탭 전환 시 레이아웃 시프트 방지
- `prefers-reduced-motion` 미디어쿼리
- 모달/오버레이: `role="dialog"`, `aria-modal`, `aria-labelledby`, 포커스 트랩
- 탭 패널: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`
- 동적으로 업데이트되는 영역: `aria-live="polite"`
- 터치 타겟: `min-height: 44px` (`pointer: coarse` 미디어쿼리)
- 이모지가 장식용이면 `aria-hidden="true"` 처리

---

## 애니메이션

```css
/* 허용 */
transition: background-color .15s, color .15s, border-color .15s;
transition: transform .25s cubic-bezier(.16,1,.3,1);

/* 금지 */
transition: all; /* 특정 속성만 명시 */
/* bounce, elastic easing — 구식 느낌 */
```

---

## 하지 말아야 할 것들 (Anti-Patterns)

| 패턴 | 이유 |
|------|------|
| Primary로 인디고/바이올렛 계열 사용 | AI 기본값, 즉시 AI 느낌 |
| 솔리드 필 버튼 | 아웃라인 대비 시각적 무게가 너무 큼 |
| Pill 형태 탭 | AI 대시보드 패턴 |
| 메트릭 카드 그리드 | 가장 흔한 AI 대시보드 패턴 |
| 헤딩·빈 상태에 이모지 | AI 생성 앱의 시그니처 패턴 |
| `transition: all` | 불필요한 속성까지 애니메이션 |
| 새로고침 버튼 (상시 노출) | 자동 폴링이나 수동 새로고침으로 충분 |
| 중첩 카드 | 시각적 복잡도 증가 |
| 그라데이션 텍스트 | 가장 강한 AI 슬롭 신호 |
| `border-left > 1px` 컬러 스트라이프 | 카드 강조에 사이드 스트라이프 대신 배경 틴트 사용 |

---

## CSS 관리 규칙

- 디자인 토큰은 `style.css` `:root`에 전부 정의
- 하드코딩 색상 금지 — 반드시 토큰 사용
- `admin.html`에서 `style.css?v=N` 캐시 버스팅 — CSS 수정 시 N 반드시 증가
- 다크모드 미지원 (이 프로젝트 한정)
