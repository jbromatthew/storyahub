# Storyahub ERP Sales — Cloud Agent 인수인계

> Cursor Cloud Agent / Claude Code 등 **새 세션**에서 이 파일을 **첫 메시지에 첨부**하거나, 아래 「에이전트 시작 프롬프트」를 그대로 붙여넣으세요.

**마지막 동기화:** 2026-07-09 (2차 갱신)  
**브랜치:** `main`  
**최신 커밋:** `a3734e3` — Add team management to members and fix the "미가입" linking bug.  
**원격:** `origin` = `git@github.com:jbromatthew/storyahub.git`  
**프로덕션:** https://record.storyahub.com (프론트) · https://api.storyahub.com (API) — main = 프로덕션 배포본 일치

**롤백 태그:** `erp-sales-baseline-2026-07-09`, `prod-rollback-kb-editor` (지식백과 에디터까지의 기준선 `f75a481`)

---

## 에이전트 시작 프롬프트 (복사해서 사용)

```
Storyahub ERP Sales 모듈 작업을 이어서 해줘.

1. 먼저 레포 루트의 docs/CLOUD_AGENT_HANDOFF.md 전체를 읽고 컨텍스트를 맞춰.
2. 변경은 최소 diff 원칙. 기존 naming/스타일 따르기.
3. 배포는 자동이 아님 — 사용자가 "배포해"라고 할 때만 scripts/deploy-*.sh 실행.
4. 커밋/푸시는 사용자가 요청할 때만.
5. Google Sheets는 현재 readonly — 쓰기 연동은 별도 작업.

[여기에 이번에 할 작업 적기]
```

---

## 1. 프로젝트 구조

```
storyahub/
├── frontend/          # Vite + React (record.storyahub.com)
│   └── src/erp/
│       ├── modules.jsx    # ★ Sales 뷰 대부분 (3000+ lines)
│       ├── config.js      # ERP 메뉴 ID
│       ├── erpStyles.js   # sales/dash/rate/trend CSS
│       └── ErpApp.jsx     # 라우팅
├── backend/           # Express + Prisma + PostgreSQL
│   └── src/services/
│       ├── salesDaily.ts
│       ├── salesDashboard.ts
│       ├── salesDashboardGoals.ts   # 계기판 목표 DB 저장
│       ├── salesPaymentRate.ts
│       ├── salesTrend.ts
│       ├── salesSync.ts
│       └── googleSheets.ts          # readonly API
└── scripts/
    ├── deploy-frontend.sh   # S3 + CloudFront
    ├── deploy-backend.sh    # EC2 rsync + PM2
    └── deploy-all.sh
```

**로컬 개발**

```bash
# backend
cd backend && npm install && npm run dev   # :4000

# frontend
cd frontend && npm install && npm run dev  # Vite, API는 api.storyahub.com 또는 로컬
```

---

## 2. ERP Sales 메뉴 ↔ 코드 매핑

| 메뉴 (한글) | config id | 프론트 컴포넌트 | 백엔드 API |
|------------|-----------|----------------|-----------|
| 문의/결제 대시보드 | `sales-daily` | `SalesDailyView` | `GET /erp/sales/daily` |
| 세일즈 동기화 | `sales-sync` | `SalesSyncView` | `POST /erp/sales/sync` |
| 결제율 분석 | `sales-rate` | `PaymentRateView` | `POST /erp/sales/payment-rate` |
| 문의 월간추이 | `sales-inquiry-trend` | `SalesInquiryTrendView` | `GET /erp/sales/trend/inquiry` |
| 세일즈 월간추이 | `sales-trend` | `SalesTrendView` | `GET /erp/sales/trend` |
| 세일즈 계기판 | `sales-dashboard` | `SalesDashboardView` | `GET/PUT /erp/sales/dashboard` |
| 멤버/팀 관리 | `members` (admin) | `MembersView` | `/erp/members`, `/erp/departments`, `/erp/employees/:id` |

라우트 정의: `backend/src/routes/salesSync.ts` (sales), `backend/src/routes/erp.ts` (members/teams/OKR)  
API 클라이언트: `frontend/src/api/client.js` (`erpSales*`, `erp*` 메서드)  
공용 통계 시각화(표/막대/꺾은선/도넛 전환 + hover 툴팁): `frontend/src/erp/charts.jsx` (`StatViz`)  
- `SalesTrendView`/`SalesInquiryTrendView`는 공통 `TrendMatrixView` 래퍼 사용. 문의추이는 `업종별` 탭 + 교차탭에서 `전체 종합` 토글(`all=1`) 지원.
- 문의 월간추이 데이터: **상품문의 DB**(`ErpSalesInquiry`, `구분=신규문의`) 실시간 집계. 필드: `문의요금제`·`직전서비스`·`문의기능`·`마케팅채널`. 서비스 `backend/src/services/salesInquiryTrend.ts`.

---

## 3. 데이터 소스

### Google Sheets (읽기 전용)

- 서비스 계정 scope: `spreadsheets.readonly`
- **상품문의:** `18sGtMD5n-PMuwtB_5N3uQe0gfLWsMURweT1w1B6Ax_0` — `구분=신규문의`
- **결제주문:** `1TWHPuMkDhb29KyJXNPmTy4xXNEF-MFiUIxzwz9bIZ58` — `구분=신규센터`
- **세일즈 계기판 목표:** `1MCpTNTj9npiNpHV9_HxnOtGfO7nnY7sdbVJoWzUFvzc` — 월별 탭, 1.채널별 / 2.업종별 / 3.요금제별, 1~N주차 행
- 동기화 후 **PostgreSQL** `ErpSalesInquiry`, `ErpSalesOrder` 에 저장

### 계기판 목표 (앱 수정)

- 테이블: `ErpSalesDashboardGoalSet` (month PK, industryGoals JSON, industryPlanGoals JSON)
- 시트 기본값 + **DB override** (시트에는 아직 역반영 없음)
- `PUT /erp/sales/dashboard/goals`

---

## 4. 비즈니스 규칙 (집계 시 반드시 지킬 것)

### 결제율 분석 (`salesPaymentRate.ts`)

- **문의수:** 월 시트 + `구분=신규문의`
- **상담진행&운영중:** `부재율` = `상담완료` 또는 `부재 상담완료`, **오픈전 TRUE 제외**
- **부재:** 완전부재·부재1차·부재2차
- **부재율:** 부재 ÷ 문의수
- **당월/실 결제전환율:** 상담진행 대비 당월결제/실결제
- 업종 **다중 선택** 가능 (`industries[]`)
- **통계 탭:** 월별 timeline + 꺾은선 그래프 (SVG, recharts 없음)

### 문의/결제 대시보드 (`salesDaily.ts`)

- KST 기준, **주간 = 일요일~토요일**
- 기준일 **‹ ›** 화살표로 하루 이동

### 월간 추이 (`salesTrend.ts`)

- 결제 DB 신규센터만
- 업종X요금제/채널: 업종 **다중 선택** → 종합 집계
- **셀 클릭 선택** → 합계/평균 바

### 세일즈 계기판 (`salesDashboard.ts`)

- **목표:** 대시보드 시트 (+ DB override)
- **현황:** 결제 DB 신규센터 (결제일 기준)
- **주차:** 1~7일=1주차, 8~14=2주차 … (월 내)
- **업종 클릭** → 요금제별/채널별/주차별 drill-down, `← 업종 목록` 복귀
- **목표 편집:** 업종별 목표 → 업종×요금제 분배 (합계 검증 경고)

---

## 5. 배포 (자동 CI 없음)

**push만으로는 배포되지 않음.** GitHub Actions 없음.

### 프론트

```bash
./scripts/deploy-frontend.sh
# 필요: AWS CLI, CLOUDFRONT_DISTRIBUTION_ID (또는 scripts/deploy-frontend.env)
# → S3 storyahub-frontend → CloudFront 무효화 (~1–3분)
```

### 백엔드

```bash
./scripts/deploy-backend.sh
# 이제 스크립트가 자동으로: (1) 로컬 tsc 빌드 → (2) dist 포함 rsync →
#   (3) 원격 prisma generate + migrate deploy(.env.production의 DATABASE_URL 주입) + pm2 restart + health
curl https://api.storyahub.com/health
```

### EC2 기본값 (`deploy-backend.sh`)

- Host: `43.202.201.187`, User: `ubuntu`
- PM2 app: `storyahub-api`
- **OOM 해결됨:** EC2에서 `npm run build`(tsc)가 OOM나던 문제 → 스크립트가 **로컬 빌드 + dist rsync**로 개선됨 (원격 빌드 안 함).
- **migrate localhost 문제 해결됨:** 스크립트가 `.env.production`의 `DATABASE_URL`(RDS)만 주입해 `migrate deploy` 실행 (JSON은 건드리지 않음).

### 배포에 필요한 시크릿 (레포에 없음)

- `scripts/deploy-backend.env` — `SSH_KEY`, `EC2_HOST` 등
- `scripts/deploy-frontend.env` — `CLOUDFRONT_DISTRIBUTION_ID` 등
- AWS credentials (`~/.aws/credentials`)
- EC2 `backend/.env.production` — DATABASE_URL(RDS), Google SA JSON 등

Cloud Agent VM에는 기본적으로 **없음** → 배포하려면 사용자가 Secrets/SSH 설정 필요.

---

## 6. 자주 건드리는 파일

| 작업 | 파일 |
|------|------|
| Sales UI 전반 | `frontend/src/erp/modules.jsx` |
| Sales 스타일 | `frontend/src/erp/erpStyles.js` |
| 통계 차트/전환 컴포넌트 | `frontend/src/erp/charts.jsx` (`StatViz`, Bar/Line/Donut) |
| 메뉴 추가 | `frontend/src/erp/config.js`, `ErpApp.jsx` |
| Sales API | `backend/src/routes/salesSync.ts`, 서비스 `backend/src/services/sales*.ts` |
| 멤버/팀/OKR API | `backend/src/routes/erp.ts`, 접근권한 `backend/src/services/erpAccess.ts` |
| API 클라이언트 | `frontend/src/api/client.js` |
| Prisma | `backend/prisma/schema.prisma` + `migrations/` |
| 업종 목록 | `backend/src/services/industryTypes.ts` |
| 지식백과 에디터 | `frontend/src/components/KbEditor.jsx`, `kbRich.js`, `kbStyles.js` |

---

## 7. 코딩 컨vention

- UI 텍스트: **한국어**
- 날짜/타임존: **Asia/Seoul (KST)**
- 프론트: React hooks, 별도 chart 라이브러리 없음 → SVG 직접 그림
- 커밋: 영어 한 줄 요약 + why (예: `Add weekly breakdown to sales dashboard.`)
- **커밋/푸시/배포는 사용자 요청 시에만**
- scope 최소화 — 요청과 무관한 리팩터 금지

---

## 8. 최근 구현 완료 (2026-07-09 기준)

세일즈 통계·계기판 (이전):
- [x] 문의/결제 대시보드 기준일 화살표 · 결제율/월간추이/계기판 (다중선택·drill-down·주차탭)

2차 작업 (이번 세션):
- [x] 지식백과 **노션형 블록 에디터** (인라인 서식·드래그·H1/H2/H3·토글·마크다운·아이콘/커버) — `KbEditor.jsx`, `kbRich.js`
- [x] 세일즈 4개 뷰에 **표↔차트 전환**(막대/꺾은선/도넛) + hover 값 툴팁 — `charts.jsx`(`StatViz`)
- [x] **문의 월간추이** 신설 (상품문의 DB 실시간, 업종별/요금제/직전서비스/문의기능/채널×요금제 + 전체 종합), `월간 추이`→`세일즈 월간추이` rename
- [x] **멤버 관리에 팀(부서) 생성·삭제 + 멤버 배정 UI**
- [x] **"미가입" 버그 수정** — 초대 이메일이 기존 계정과 미연결되던 것 self-heal(`erpAccess.resolveErpAccess`) + `/erp/members` 조회 시 이메일 대조 연결
- [x] 파비콘/홈 아이콘 → 신형 **BROJ 원형 로고** (`frontend/public/*.png`)
- [x] `deploy-backend.sh` **OOM 우회 개선** (로컬 빌드 + dist rsync)
- [x] OKR 운영 가이드(문서) — OKR/CFR/AAR 3R 시스템을 앱 메뉴에 매핑 (코드 아님)

---

## 9. 알려진 후속 작업 / 미구현

- [ ] 계기판 목표 **Google Sheets 역쓰기** (scope 변경 + 셀 매핑 필요)
- [ ] GitHub Actions로 push → deploy 자동화
- [ ] **OKR 운영 기능 강화** (팀별 Objective/KR 흐름, 주간 CFR 체크인, 분기 AAR→지식경영 연동) — 가이드 참고
- [ ] 주차 기준이 시트와 다를 경우 (일요일 시작 등) — 사용자 확인 후 조정
- [x] ~~EC2 `npm run build` OOM~~ — 해결됨 (deploy-backend.sh 로컬 빌드 방식)

---

## 10. Cloud Agent에서 안 되는 것

- 로컬 `deploy-backend.env` / SSH 키 / AWS 없으면 **배포 불가** → 코드+커밋+푸시까지만. 배포는 사용자가 로컬 맥에서 `./scripts/deploy-*.sh` 실행.
- Google Sheets **쓰기** (readonly)
- 프로덕션 DB 직접 조회 (RDS는 EC2/VPC 내부) — 로컬에서도 DB 직접연결 불가(터널 필요)

---

## 11. 작업 후 체크리스트

1. `cd backend && npm run build`
2. `cd frontend && npm run build`
3. 사용자 요청 시: deploy + `curl https://api.storyahub.com/health`
4. 사용자 요청 시: git commit & push

---

## 12. 문의 시 참고

- 이전 대화 요약은 Cursor 로컬 transcript에 있을 수 있음 — **이 파일이 ground truth**
- 프로덕션 반영 여부는 항상 deploy 실행 여부로 확인 (push ≠ deploy)
