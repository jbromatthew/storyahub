# Storyahub

녹음·통화·사진을 자동으로 요약·정리하고, 인맥·일정·할 일·딜(매출)까지 한 곳에서 관리하는 AI 비서 앱.

핵심 루프: **녹음/사진 → 요약 → 액션(할 일)·다음 약속(일정) → 인맥·딜에 자동 누적**

## 구성

```
storyahub/
├─ frontend/   React PWA (Vite) — 클라이언트 앱
└─ backend/    Node.js + TypeScript (Express) + PostgreSQL(Prisma) — API 서버
```

## 빠른 시작 (Cursor 등 로컬)

### 0) 한 번에 설치·실행

```bash
npm install                 # 루트 concurrently
npm run install:all         # backend + frontend 의존성
```

`backend/.env`에서 RDS 비밀번호를 설정한 뒤:

```bash
npm run db:migrate          # RDS에 스키마 적용 (prisma migrate deploy)
npm run dev                 # API :4000 + 프런트 :5173 동시 기동
```

### 1) Backend (개별)

```bash
cd backend
cp .env.example .env        # DATABASE_URL에 RDS 마스터 비밀번호 입력
npm install
npm run prisma:migrate      # RDS 스키마 적용
npm run dev                 # http://localhost:4000
```

**RDS 연결 문자열 예시**

```
postgresql://postgres:YOUR_PASSWORD@database-1.czqkai6ywh46.ap-northeast-2.rds.amazonaws.com:5432/storyahub?sslmode=require
```

RDS에 `storyahub` DB가 없으면 먼저 생성:

```sql
CREATE DATABASE storyahub;
```

로컬에서 RDS에 접속하려면 **퍼블릭 액세스** + **보안 그룹 5432 인바운드**(내 IP)가 필요합니다.

### 2) Frontend (개별)

```bash
cd frontend
cp .env.example .env        # VITE_API_BASE=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

## 아키텍처 요약 (100만 유저까지 확장 설계)

- **프런트**: React PWA → 정적 배포(S3+CloudFront 또는 Cloudflare Pages)
- **API**: 무상태(stateless) Node 서버 → 수평 확장
- **DB**: PostgreSQL (시작은 Supabase/Neon 등 관리형, 확장 시 RDS/Aurora). "순수 PG"로만 사용해 이전 용이
- **미디어**: Cloudflare R2 (presigned URL 직결, **egress 무료**) — 서버를 거치지 않음
- **AI 변환**: Gemini(STT/요약) — 무거운 작업은 **비동기 큐 + 워커**로 분리 (웹 요청에서 분리)
- **캐시/세션/큐**: Redis (초기엔 PG 테이블/메모리로 대체 가능)

## 비용 원칙

- 명함 OCR은 **온디바이스 처리**(원가 0) → 전 플랜 무료
- 과금은 **변환(시간) + 저장(GB)** 2축. 무료는 "원가 0 기능"만.
- 딜/견적: 공급가액만 입력 → 부가세(×0.1)·합계(×1.1) 자동(곱셈, AI 미사용)

자세한 제품 기획은 별도 기획서(.docx) 참고.
