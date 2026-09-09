-- 참가자 심사 단계를 공고문 사다리에 맞춘다
--   reviewing → screening   (1차 서면심사)
--   passed    → top14       (1차 합격 · 예비합격 자리)
--   finalist  → top7        (본선 7팀)
--   reserve   → top14       (예비 7팀 = TOP14 에 머문 쪽)
--   final3    → top3        (최종 3팀)
UPDATE "ErpFoundersApply" SET "status" = 'screening' WHERE "kind" = 'applicant' AND "status" = 'reviewing';
UPDATE "ErpFoundersApply" SET "status" = 'top7'      WHERE "kind" = 'applicant' AND "status" = 'finalist';
UPDATE "ErpFoundersApply" SET "status" = 'top14'     WHERE "kind" = 'applicant' AND "status" IN ('passed', 'reserve');
UPDATE "ErpFoundersApply" SET "status" = 'top3'      WHERE "kind" = 'applicant' AND "status" = 'final3';
