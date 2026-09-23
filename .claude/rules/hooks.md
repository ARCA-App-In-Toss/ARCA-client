---
paths:
  - ".claude/**/*"
  - "package.json"
  - "pnpm-lock.yaml"
  - "yarn.lock"
  - "package-lock.json"
---
# 훅·게이트·상태 계약

배선은 `.claude/settings.json`, 실행은 `.claude/hooks/checks/`가 소유한다.

## 훅

- SessionStart는 다음 행동의 포인터만 출력한다. 빌드 요청 자체로 해석하지 않는다.
- PreToolUse는 위험 명령과 `.env` 쓰기의 실수 방지 장치다. `.env.example`은 placeholder 작성이 가능하다. 정규식은 보안 격리나 모든 셸 쓰기 감지를 보장하지 않는다.
- 매 편집 뒤 자동 포맷/검사는 없다. 완료된 변경 묶음에 명시적 lint를 사용해 숨은 수정·중복 검사를 피한다.
- Stop은 상태 구조·완료 증거 기록만 확인한다. 검사 실행·재시도 증가·완료 처리는 하지 않는다. 상태 오류는 한 번 안내하고 `stop_hook_active`이면 즉시 종료를 허용한다. 질문·부분 진행·manual-review는 종료 가능하다.
- 훅 경로와 검사 cwd는 프로젝트 루트에 고정한다.

## 검증 명령

`bash .claude/hooks/checks/gate-runner.sh [fast|--full|--release]`

- fast: 상태·명세 존재 → lint·typecheck·디자인 토큰 휴리스틱 검사.
- full: fast + test·test:contract·build. **단계 완료 후보에서 한 번** 실행한다.
- release: full + test:browser. 실제 환경·운영 증거는 08에서 별도 판정한다.

package 이전 fast는 `BOOTSTRAP OK`일 뿐 앱 PASS가 아니다. package가 없으면 full/release는 BLOCKED다. package script 누락, packageManager/단일 lockfile 불일치는 실패다. 검사 중 첫 실패에서 멈추므로 뒤 검사는 NOT_RUN이다. 실패 원인을 고친 뒤 해당 검사부터 확인하고, 완료 후보가 되었을 때 full/release를 다시 실행한다. 동일한 코드·환경에서 통과한 검사를 이유 없이 반복하지 않는다.

검사당 180초, 전체 600초, 검사 로그당 256 KiB 상한이다. timeout/출력 한도 초과는 실패이며 성공으로 축약하지 않는다. 자동으로 한도를 올리거나 재실행하지 않는다. 로그는 실행별 임시 디렉터리에 분리하고 성공 로그는 삭제한다. 모델에는 결과·실패 로그 경로만 출력한다. 필요한 실패 구간만 읽고 민감값을 출력하지 않는다. 토큰 검사는 디자인 raw 값 휴리스틱이며 LLM 토큰 예산 측정기가 아니다.

## 상태 기록

- `status`: TODO / IN_PROGRESS / COMPLETED / SKIPPED / manual-review. IN_PROGRESS는 최대 하나이며 앞선 미완료·미승인 항목을 건너뛰지 않는다.
- 현재 단계의 `work`에는 작업 목표·관련 refs·변경 파일·다음 행동만 짧게 유지할 수 있다. 원본 발췌나 대화 전문을 저장하지 않는다.
- `retry[id]`: `{ "unit": "작업 목표", "attempts": 1, "reason": "실패 원인" }`. attempts는 실패한 자동 재수정 횟수다. 최초 실패 진단 후 최대 2회만 수정·확인한다. 실패 메시지 변경·새 세션·리뷰어 변경으로 초기화하지 않는다. 해결된 작업의 다음 독립 단위 또는 사용자 답변/환경 변경으로 재개할 때만 근거를 log에 남기고 초기화한다.
- 2회 실패 또는 외부 입력 필요 시 status를 manual-review로, `manual_review`에 `{ "id": "step-…", "reason": "막힌 원인", "next_action": "필요한 답/조치" }`를 남긴다. 3회를 채우려고 재시도하지 않는다. 답이 없으면 그대로 종료한다.
- COMPLETED는 리뷰 파일의 필수 관점 PASS·full(8단계는 release) PASS 기록이 필요하다. 리뷰는 실행 증거를 참조하는 기록이며 JSON 자체가 실행 사실을 증명하지는 않는다.
- `approvals[id]`: `{ "ts": "ISO-8601", "evidence": "승인한 사용자 발언/범위" }`. 기존 명시적 승인·연속 진행 위임을 반영하고 같은 승인을 다시 묻지 않는다. SKIPPED도 사유·승인이 필요하다. 마지막 단계의 승인 대기도 유지한다.
- 재개 시 해결된 manual_review를 제거하고 이전 차단 사유·해결 근거를 log에 한 줄 남긴다. log는 최근 20개 요약만 유지하고 상세 검증 증거는 기존 리뷰/08 위치를 참조한다.
