---
paths:
  - "src/**/*"
  - "tests/**/*"
---
# 규칙 — 금지 패턴

- 명세에 없는 화면·OP·field·오류·정책을 창작한다.
- `.claude/spec/`의 00~08이나 wire 계약을 다른 위치에 복제해 두 번째 원본을 만든다.
- 수기 DTO·수기 wire validator·수기 Mock 계약으로 OpenAPI 파생 영역을 대체한다.
- 화면에서 fetch·SDK·Storage·token을 직접 다룬다.
- timeout/Abort/404를 mutation 미적용으로 간주하거나 server 정본을 optimistic하게 바꾼다.
- 본문·닉네임·식별값을 로그·분석·오류·URL·artifact에 넣는다.
- UTF-16 길이, trim, native maxLength로 EGC·원문 보존 계약을 깨뜨린다.
- 테스트를 마지막 단계로 미루거나 같은 assertion을 모든 검증 층에 복제한다.
- 실제 환경 미검증을 PASS로 표시하거나 `PARTIAL/BLOCKED/NOT_RUN`을 완료로 해석한다.
- 게이트 실패를 retry·timeout 증가·assertion 삭제·quarantine으로 덮는다.
- 운영 build에 개발용 ACTIVE 승객 우회를 포함한다.
