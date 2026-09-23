# Step 1 — 실제 저장소 인테이크

## 작업 선택

source/package/lockfile 존재와 06 §2.1~2.3·§12 단계 1을 먼저 확인한다. API 파생 도구는 §3.4, UI 후보는 §2.4~2.5를 실제 선택할 때 읽는다. 후보 비교는 작업당 현재 후보와 대안 하나까지만 검증하고 모두 막히면 필요한 판단을 요청한다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `00_INDEX.md` §9
- `06_FRONTEND_SPEC.md` §2, §3.4, §12 단계 1, §14
- `08_QA_AND_INTEGRATION.md` §11~§12

## 작업

- 실제 source/package/lockfile/CI가 있으면 보존하며 공식 AIT 템플릿·SDK export·peer dependency와 비교한다. 없으면 공식 `create-ait-app --template react-ts`의 현재 문서·버전을 확인한 뒤 빈 임시 디렉터리에서 생성해 필요한 파일만 가져온다. 현재 docs/spec/.claude/git 설정을 덮어쓰지 않는다.
- Node 24 LTS, 고정 pnpm/lockfile, React/TypeScript/Vite 계열, React Router, Query v5, native fetch, Zod 4, Biome 2 방향을 실제 버전으로 고정한다.
- strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`와 package scripts `lint`, `typecheck`, `test`, `test:contract`, `build`, `test:browser`를 실제 runner에 연결한다.
- OpenAPI 생성기는 모델에 JSON 전체를 넣지 않고 고정 command로 후보를 검증한다. 생성 영역 수기 patch를 금지한다.
- 픽셀 UI 후보의 export·CSS·React peer·라이선스·WebView·bundle 조건을 확인하고 CMP별 선택 근거를 06 §2.4의 기존 표에 연결한다.
- 실제 값이 없는 API host·정책 URL·Sentry DSN·credential은 만들지 않는다.

## 완료

확인된 명령이 실행되고 설치/미확인/BLOCKED가 구분된다. 앱 구현을 시작하지 않아도 된다.
