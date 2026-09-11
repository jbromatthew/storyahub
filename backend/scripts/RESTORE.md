# 데이터를 되돌려야 할 때

세 가지 길이 있다. 위에서부터 손이 덜 간다.

## 1. 방금 실수했다 — 표 하나, 몇 줄

R2 에 매일 떠 놓은 덤프에서 **그 표만** 꺼낸다. 운영 DB는 건드리지 않고
임시 DB에 풀어서 필요한 줄만 옮기는 쪽이 안전하다.

```bash
# EC2 에서
cd ~/storyahub/backend
node scripts/db-backup.mjs --list        # 어떤 백업이 있나

# R2 에서 내려받기 (AWS CLI 를 R2 엔드포인트로)
# 또는 backups/ 폴더에 최근 5개가 그대로 있다
ls -la backups/

# 표 하나만 풀기
pg_restore -l backups/storyahub-XXXX.dump | grep ErpFoundersApply
pg_restore --data-only -t '"ErpFoundersApply"' -d "$DB_URL_임시" backups/storyahub-XXXX.dump
```

## 2. 몇 시간 전으로 되돌려야 한다

RDS **특정 시점 복원(PITR)** 을 쓴다. 운영 인스턴스는 그대로 두고
새 인스턴스를 그 시점으로 띄운 뒤, 필요한 것만 옮기거나 접속을 갈아탄다.

AWS 콘솔 → RDS → storyahub → 작업 → **특정 시점으로 복원**

되돌린 인스턴스가 뜨면 `backend/.env.production` 의 `DATABASE_URL` 호스트만
바꾸고 `bash scripts/deploy-backend.sh` 로 다시 올린다.

## 3. 통째로 날아갔다

R2 의 가장 최근 덤프로 새 DB 를 만든다.

```bash
createdb storyahub                       # 또는 RDS 새 인스턴스
pg_restore --no-owner --no-acl -d "$NEW_DB_URL" storyahub-XXXX.dump
```

그다음 `.env.production` 의 `DATABASE_URL` 을 새 주소로 바꾸고 배포한다.

---

## 지금 걸려 있는 것

| 무엇 | 어디 | 얼마나 |
|---|---|---|
| 논리 덤프 (pg_dump -Fc) | R2 `backups/db/` | 30일 |
| 같은 덤프 | EC2 `backend/backups/` | 최근 5개 |
| RDS 자동 백업·PITR | AWS | 콘솔에서 확인 (아래) |

크론은 EC2 에서 **매일 KST 04:00** 에 돈다.

```bash
crontab -l                                    # 걸린 것 보기
tail -50 ~/storyahub/backend/backups/backup.log   # 마지막 결과
node scripts/db-backup.mjs                    # 손으로 한 번 뜨기
```

## AWS 콘솔에서 한 번은 봐야 하는 것

배포 계정(`storyahub_front`)에 RDS 권한이 없어 코드에서는 확인할 수 없다.
RDS → storyahub → 유지 관리 및 백업에서:

- **백업 보존 기간** — 0일이면 PITR 이 아예 없다. 7일 이상 권장
- **삭제 방지(Deletion protection)** — 켜 두면 실수로 인스턴스를 못 지운다
- **스토리지 자동 조정(Storage autoscaling)** — 최대치를 넉넉히. 디스크가 차면 DB 가 멈춘다
- **최종 스냅샷** — 인스턴스를 지울 때 스냅샷을 남기게
