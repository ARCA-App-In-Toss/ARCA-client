---
paths:
  - "src/**/*"
  - "tests/**/*"
  - ".claude/spec/0[5-8]_*.md"
---
# 규칙 — 개인정보·보관·복구

- 응답 원문·발췌·닉네임·익명 키·token·내부 ID는 URL/history/referrer, console/logger, analytics, 오류/Sentry, trace/HAR, 파일명에 남기지 않는다.
- 합성 canary도 UI·허용 메모리·Storage·통신 경로 밖으로 새면 실패다.
- 익명 식별과 영속 보관은 Apps in Toss adapter만 사용한다. random ID나 `localStorage` fallback을 만들지 않는다.
- draft 본문과 command 추적 상태의 수명을 분리한다. write read-back 실패 시 저장 요청을 보내지 않는다.
- 전체 삭제 성공 전에는 server/local 데이터를 지우지 않는다. 성공 뒤 이전 generation만 정리하고 새 탑승 자료를 지우지 않는다.
- screenshot·video·DOM snapshot은 중립 합성 UI만 허용한다. token·키·raw request/response·Storage value는 캡처하지 않는다.
- 실제 기기·실서버·retention 증거가 없으면 `BLOCKED` 또는 `NOT_RUN`으로 남긴다. Mock 통과로 대체하지 않는다.
