---
paths:
  - "src/**/*"
  - "tests/**/*"
  - ".claude/spec/06_FRONTEND_SPEC.md"
---
# 규칙 — ARCA 프런트엔드 경계

권위는 `.claude/spec/06_FRONTEND_SPEC.md` §2~§10이다.

```text
screen + UI
  -> domain use case / hook
  -> ArcaApi · DraftStore · CommandStore · PlatformPort
  -> HTTP · SDK Storage · Apps in Toss adapter
```

- 루트 책임은 `app/`(화면용 hook은 `app/hooks/`), 공통 장면은 `scenes/`, 화면은 `screens/`(공통 흐름은 `screens/shared/`), 상태 전이는 `domain/`, 외부 데이터는 `data/`, SDK는 `platform/`, CMP는 `ui/`에 둔다.
- `domain/`은 `domain/ports/`의 인터페이스에만 의존한다. `data/`·`platform/`이 포트를 구현하고 composition root만 구체 객체를 조립한다. 방향은 `biome.json`이 강제한다.
- 화면은 URL·DTO·token·Storage key·SDK를 직접 다루지 않는다.
- `data/api/generated`는 기계 생성 전용이며 손으로 patch하지 않는다.
- Query hook은 `ArcaApi`만 호출하고 mutation lifecycle은 `CommandCoordinator`가 소유한다.
- source of truth를 Query cache·Context·화면 store에 중복하지 않는다.
- session epoch와 data generation이 다른 늦은 비동기 결과를 적용하지 않는다.
- 실제 package/SDK export가 확인되기 전에는 존재한다고 가정하지 않고 port를 유지한다.

아키텍처 리뷰는 파일 수나 특정 함수 이름이 아니라 이 책임과 의존 방향을 판정한다.
