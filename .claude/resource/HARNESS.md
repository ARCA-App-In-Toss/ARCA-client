# ARCA 빌드 하네스

승인된 `.claude/spec/00~08`을 작업별로 소비한다. 현재 진행은 `build-state.json`에서 확인하며 이 문서에 복제하지 않는다. `.claude/spec/`·`spec/platform/`·`design/`은 로컬 자료이므로 새 checkout에 없으면 경로 제공을 요청한다.

## 사용과 책임

- “빌드 시작/이어서 구현” → build-orchestrator. 일반 질문·명세/하네스 수정에는 빌드 루프를 시작하지 않는다.
- checklist는 06 §12의 8개 단계다. 단계 안에서 작은 작업을 구현하고 관련 검사만 실행한다.
- implement-one-slice는 구현·직접 영향 검사, orchestrator는 단계 완료 게이트·필수 검토 관점·상태 전환, build-review-packet은 결과 출력만 담당한다.
- 단계 완료 결과를 검토한 뒤 다음 단계로 이동한다. 사용자가 이미 승인하거나 연속 진행을 위임했으면 같은 승인을 반복 요청하지 않는다.
- 상세 규칙은 관련 파일 경로에서만 로드한다. 필요할 때는 담당 rule을 직접 읽을 수 있다. 규칙 적용 경로는 Step 1에서 실제 디렉터리 구조와 맞춘다.

## 검사와 비용 제어

- fast는 개발 중 필요할 때, full은 단계 완료 후보, release는 운영 통합 마감에 실행한다. Stop은 상태만 검사하며 테스트를 실행하지 않는다.
- 자동 재수정은 현재 작업당 최대 2회, 리뷰는 최초+수정 확인 최대 2라운드다. 사용자 입력으로만 풀리는 문제는 처음 발견했을 때 요청한다. 스킬·리뷰어 사이에서 별도 재시도 예산을 만들지 않는다.
- 리뷰 관점은 유지하되 매 단계 세 agent를 강제하지 않는다. 독립 검토가 필요한 관점에 한해 변경 범위/ID/검증 결과만 전달한다. 각 agent는 8턴 상한·읽기 전용 도구를 사용한다.
- 실행 상한·로그·상태/리뷰 형식은 `../rules/hooks.md`, 선택 읽기는 `../rules/source-of-truth.md`를 따른다.
- 앱 package 이전 fast는 상태·명세 검사만 통과한다. full/release PASS나 구현 완료로 해석하지 않는다. Step 1에서 lint/typecheck/test/test:contract/build/test:browser를 실제 runner에 연결한다.

## 산출물과 검증

진행은 build-state, 단계 판정은 reviews/<step-id>.json, 제품·검증 증거는 기존 명세 담당 위치에 기록한다. 작업 메모에는 경로·ID·다음 행동만 남긴다. 성공한 검사의 로그는 제거하며 실패 로그만 제한된 크기로 남긴다.

하네스 자체 회귀 검사: `node --test .claude/hooks/checks/harness.test.mjs`. 임시 저장소와 합성 명령으로 종료 루프·상태 전이·검사 실패/시간/출력 상한을 확인하며 앱 계약 JSON은 읽지 않는다.

훅 이벤트와 종료 재진입은 [Claude Code hooks](https://code.claude.com/docs/en/hooks), 조건부 규칙은 [memory](https://code.claude.com/docs/en/memory), 스킬 로드는 [skills](https://code.claude.com/docs/en/skills), 리뷰어 도구/턴 한도는 [sub-agents](https://code.claude.com/docs/en/sub-agents)를 따른다. 이 회귀 검사는 Claude 세션의 실제 모델 행동을 보증하지 않으므로 첫 사용 시 `/hooks`와 `/memory`에서 배선/로드를 확인한다.

## 출처

- 코드 베이스: inu-appcenter/ultimate-sugang-client `.claude`, commit `073d8db5f051a9b3100b5b0c94687e28581229da` (MIT).
- 적용 사례 참고: Team-Gravit/gravit-admin-web `.claude`, commit `30343e542295279a4a525cea80d4489c500dd992`.
- ARCA 변경: 복제 spec 제거, 00~08 선택 참조, 06 §12의 단계/작업 구분, 위험 기반 검증, 종료 루프 제거와 제한된 재수정·리뷰.
