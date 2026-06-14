# Storyahub 보안 정책

Storyahub API·프론트엔드에 적용된 기술 통제와, CSAP·ISO 27001 준비 시 **조직·운영**에서 추가로 필요한 항목을 정리합니다.

## 1. 적용된 기술 통제

| 영역 | 조치 |
|------|------|
| 세션 | JWT를 **httpOnly + Secure + SameSite=Lax** 쿠키에 저장 (JS 접근 불가) |
| HTTP 헤더 | `helmet` — HSTS(prod), Referrer-Policy, X-Powered-By 비활성 |
| CORS | origin 화이트리스트 (`CORS_ORIGINS`), `credentials: true` |
| Rate limit | 전역·로그인·업로드·OCR·공유 링크 (production) |
| JWT | HS256 고정, production 32자+ `JWT_SECRET` 필수 |
| 인증 | 모든 사용자 API — 쿠키/Bearer + `requireAccess` |
| 로그아웃 | `POST /auth/logout` — 쿠키 삭제 |
| 데모·테스트 | production 기본 차단 (`ALLOW_DEMO_AUTH`, `ALLOW_TEST_SUBSCRIBE`) |
| SSRF | KB 표지 — HTTPS·공개 IP만, 5MB 제한 |
| 미디어 키 | R2 `u/{userId}/` prefix 검증 |
| IDOR | job 폴링·소개자(referredById) 소유권 검증 |
| 비밀번호 | bcrypt 12 rounds(prod), 신규/변경 8자+ 영문·숫자 |
| 오류 | production 500 — 일반 메시지만 |

## 2. production 환경 변수

```env
NODE_ENV=production
JWT_SECRET=<openssl rand -base64 48>
CORS_ORIGINS=https://record.storyahub.com,https://app.storyahub.com,https://storyahub.com
COOKIE_DOMAIN=.storyahub.com
TRUST_PROXY=1
COUPON_ADMIN_SECRET=<강한 랜덤>
ALLOW_DEMO_AUTH=false
ALLOW_TEST_SUBSCRIBE=false
```

## 3. 배포 체크리스트

- [ ] `.env.production` 약한 시크릿 없음
- [ ] 프론트 `VITE_API_BASE=https://api.storyahub.com` + `credentials: include` (코드 반영됨)
- [ ] CloudFront **Response Headers Policy**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`
- [ ] RDS·R2 IAM 최소 권한, EC2 불필요 포트 차단
- [ ] PG 연동 후 `/auth/subscribe` 웹훅 검증으로 교체

## 4. CSAP·ISO — 코드 외 필수

정보보호 정책, 위험 평가, 접근통제·계정관리, 로그·IR, BCP, 교육, DPA, 개인정보 처리방침 등 **조직 문서·증적**이 별도로 필요합니다.

## 5. 알려진 제한

- Job 큐: 인메모리 (운영 시 Redis/SQS)
- Rate limit: 단일 EC2 (다중 인스턴스 시 Redis store)
- 캘린더 공유 링크: 토큰 보유자 ICS 조회 가능 (의도된 기능)

## 6. 취약점 신고

운영 담당자에게 비공개로 연락 — 공개 이슈에 재현 정보를 올리지 마세요.
