---
paths:
  - "src/data/**/*"
  - "src/domain/**/*"
  - "src/platform/**/*"
  - "tests/**/*"
  - ".claude/spec/05_API_SPEC.md"
---
# 규칙 — API와 결과 확실성

권위는 `.claude/spec/05_API_SPEC.md`, 구현 경계는 06 §3.4다.

- 제품 불변식·채택 계약·구현 가설을 구분한다. 실제 host·서버 존재를 가정하지 않는다.
- wire TypeScript와 Zod validator는 OpenAPI 3.1.1에서 재생성 가능하게 파생한다. 수기 DTO/validator/Mock 정본을 만들지 않는다.
- `ArcaApi`가 validator 통과 결과를 domain model로 바꾼다. native `fetch`를 사용하고 화면에 raw body·server message를 전달하지 않는다.
- 호환 추가 field는 허용하지만 필수 field·타입·날짜·nullability·닫힌 enum/event 오류는 `ProtocolFailure`다.
- `TransportFailure`, `ProtocolFailure`, 인증된 `DomainFailure`, terminal 결과를 섞지 않는다.
- timeout·Abort·5xx·조회 부재는 mutation 미적용 증거가 아니다. 서버가 인증한 `SUCCEEDED` 또는 `NOT_APPLIED`만 terminal 판정이다.
- operation ID와 ticket은 멱등성·복구 계약을 보존한다. 새 operation으로 조용히 재실행하지 않는다.
- OpenAPI와 계약 예시는 모델에 통째로 읽히지 않고 고정 생성·검증 명령으로 우선 소비한다.
