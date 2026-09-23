# Step 8 — 운영 통합 마감

## 작업 선택

08 §1.4·§13.6~13.7의 판정 기준과 기존 증거 목록에서 미완료 행을 먼저 찾는다. 환경별 누락 증거 하나씩 담당 절을 연다. 이전 단계의 모든 fixture·계약·완료 증거를 다시 읽거나 재실행하지 않는다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `05_API_SPEC.md` §13~§15
- `06_FRONTEND_SPEC.md` §13~§14, §12 단계 8
- `07_MOCK_SCENARIOS.md` 통합에서 새로 실패한 family/ID; 조합 누락을 확인할 때만 §12.1
- `08_QA_AND_INTEGRATION.md` §13의 미완료 gate 행 → 그 행이 요구하는 §4~§12의 담당 증거
- `docs/ARCA_MVP_ACCEPTANCE.md` 출시 판단에 연결된 Acc 행만

## 작업과 결과

- `--release` 자동 게이트, Chromium/WebKit 핵심 재진입, Mock 운영 제외를 확인한다.
- sandbox/production-like 실서버에서 API-V-001~027의 담당 증거와 안전한 cleanup을 연결한다.
- iOS/Android에서 Storage·IME·Back·Safe Area·lifecycle·VoiceOver/TalkBack을 확인한다.
- CORS/TLS, 정책/지원 URL, SEMA, analytics/retention/backup, source map 보호, rollout/rollback을 확인한다.
- PASS/PARTIAL/FAIL/BLOCKED/NOT_RUN을 환경별로 기록한다. release gate의 필수 행이 모두 PASS가 아니면 완료나 출시로 표시하지 않는다.
