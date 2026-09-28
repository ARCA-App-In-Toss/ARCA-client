# ARCA 프런트엔드 구현 명세

- 문서 버전: v1.5
- 최근 수정일: 2026년 9월 28일
- 상태: 확정
- 승인 주체: 제품 책임자
- 구현·검증 상태: 로컬 Mock·핵심 UI 구현 및 단위/브라우저 회귀 실행 완료(08 §14.1). 실서버·실제 토스 WebView·운영 출시는 별도 미검증
- 편집: 현행 UI·정보 위계·입력 표시를 코드와 동기화했습니다. 문구·라우트·서버 계약은 유지합니다.

승인된 계약을 구현하는 경계·상태 소유권·실행 순서의 원본입니다. 실제 앱·설치·API host·하네스·실기기 증거가 있다는 뜻은 아닙니다.

### 최소 읽기 경로

현재 파일은 `.claude/spec/06_FRONTEND_SPEC.md`입니다. 필요한 절부터 읽습니다. 경로·줄 힌트 사용법은 [00 §3 · L47–53](./00_INDEX.md#3-참조-방향과-중복-방지)을 따릅니다.

| 작업 | 읽을 위치 |
|---|---|
| 처음 구현·단계별 완료 | [§12 · L666–683](#12-구현-순서) → [§14 · L702–717](#14-미확인-사실과-변경-gate) |
| 스택·SDK·선별 UI | [§2 · L51–126](#2-실제-자료와-기술-기반) |
| 폴더·port·wire 연결 | [§3 · L128–207](#3-최소-구조와-의존-방향) |
| 상태·session·라우트·Back | [§4 · L209–250](#4-상태-소유권과-적용-가능성) → [§5 · L252–329](#5-라우팅과-앱-시작) |
| Query·목록·발췌 동기화 | [§6 · L331–386](#6-query-cache와-목록) |
| 입력·임시본·command 복구 | [§7 · L388–425](#7-입력과-임시-보관) → [§8 · L427–525](#8-storage-journal과-command-복구) |
| 닉네임·개별/전체 삭제 | [§9 · L527–576](#9-세션-닉네임과-삭제) |
| Overlay·저장 바·분석·자원 | [§10 · L578–642](#10-플랫폼-ui-분석-오류와-보호) |
| 화면별 구현 책임 | [§11 · L644–664](#11-15개-화면-구현-책임-인벤토리) |

## 1. 범위, 권위와 적용 기준

### 1.1 이 문서가 소유하는 것

composition root·레이어/port·route/guard·상태/cache·session epoch/generation·Storage/journal·command 실행/복구·삭제 정리·플랫폼/분석·구현 순서를 소유합니다. 화면별 책임은 §11, 실행 순서는 §12입니다.

### 1.2 소유하지 않는 것

제품 결과·화면·문구·서버 판정은 담당 SSOT를 따르며 여기서 재설계하지 않습니다. DB·배포는 백엔드 책임, 합성 시나리오·실행 증거는 07·08의 책임입니다. 실제 package·앱·하네스·서버가 존재한다고 가정하지 않습니다.

충돌은 [00 §4 · L55–76](./00_INDEX.md#4-충돌-우선순위와-정정-절차)를 따릅니다. `D-API-026~038`·`OD-19~20`·Rules `AN-09`·04 `IX-036·041`·05의 현재 `prepare → execute`가 기준입니다. [05 §16 · L807–819](./05_API_SPEC.md#16-저장-요청-분할-비교와-상태-전이-검증)의 단일 수락 실험은 운영 경로를 자동 대체하지 않습니다.

### 1.3 구현 불변식

1. 조회·timeout·화면 이탈·Abort는 mutation의 미적용이나 서버 취소 증거가 아닙니다.
2. 화면은 DTO, access token, SDK Storage key를 직접 다루지 않습니다.
3. 동일 정보를 Query cache, Context, 화면 store에 정본처럼 복제하지 않습니다.
4. 응답 원문·발췌·닉네임은 trim·축약·정규화하지 않습니다. URL·로그·분석·오류 보고에 넣지 않습니다.
5. 서버 정본은 optimistic하게 바꾸지 않습니다. terminal 결과가 확인된 뒤에만 최소 proof를 적용합니다.
6. 모든 비동기 결과는 요청 당시 session epoch와 data generation이 현재 적용 대상인지 확인합니다.
7. 임시본문은 마지막 수정 후 7일이면 만료합니다. command 최소 추적 상태는 본문과 별도 수명입니다.
8. 전체 삭제 성공 전에는 서버·로컬 자료를 지우지 않습니다. 성공 뒤에는 이전 generation만 정리하고 새 탑승 자료를 지우지 않습니다.

## 2. 실제 자료와 기술 기반

### 2.1 구현 전제

현재 저장소에 source·package·lockfile·하네스가 있으며 로컬 Mock·정적·단위·브라우저 검증을 실행했습니다(08 §14.1). 이 문서는 구현 경계와 남은 운영 연결을 구분합니다. 설치·실기기 확인 항목은 §14, 서버·법무·운영 연결값은 [05 §13.2 · L733–747](./05_API_SPEC.md#132-실제-값구현-확인-필요)를 따릅니다.

### 2.2 선택한 스택과 설치 상태

| 책임 | 승인한 선택 | 현재 상태·제한 |
|---|---|---|
| 앱 기반 | 공식 `create-ait-app --template react-ts`, Apps in Toss Web Framework SDK 3.x 이상 | `create-ait-app@0.2.7` react-ts로 생성(2026-09-27). `@apps-in-toss/web-framework`·`devtools` 3.5.0 고정, `ait build`로 `.ait` 생성 확인. SDK export는 §2.3 |
| 런타임 | React+TypeScript, 공식 템플릿이 채택한 Vite 계열 build | React 19.2.8, TypeScript 6.0.3, Vite 8.3.1·`@vitejs/plugin-react` 6.1.1 |
| 라우팅 | React Router | `react-router` 8.4.0 설치. route 구성은 단계 2 |
| 서버 상태 | `@tanstack/react-query` v5, 메모리 cache만 사용 | 5.104.0. persister·전역 normalized store 없음 |
| 로컬 UI·form | React 내장 state/reducer와 도메인 hook | 외부 UI가 별도 form 정본을 소유하지 않음. 전이 의존성은 §2.4에서 확인 |
| HTTP·검증 | native `fetch`, Zod 4, `ArcaApi` adapter | Axios 없음. Zod 4.6.5, `@hey-api/openapi-ts` 0.99.0(typescript+zod plugin)을 `scripts/api-generate.mjs`로 `src/data/api/generated`에 생성. `additionalProperties: false`는 plugin resolver로 `z.strictObject` 매핑(생성물 수기 patch 없음). contract 예시 58건 일치, orval 8.38.0은 schema 단위 validator·closed object 미지원으로 제외 |
| UI·스타일 | native HTML의 의미 보존, ARCA 의미 기반 CSS 변수, 픽셀 UI 컴포넌트 선별 도입 | Tailwind 사용 허용, Emotion은 필요한 범위에 한정. 후보·설치 상태는 §2.4, 스타일 소유는 §2.5 |
| 복합 Overlay | `@radix-ui/react-dialog`·`@radix-ui/react-alert-dialog`만 ARCA wrapper 뒤에서 사용 | `@radix-ui/react-alert-dialog` 1.1.23(MIT, React 19 peer)을 `src/ui/PixelAlertDialog.tsx` wrapper 안에서만 사용(단계 3, F11 이탈 확인). `@radix-ui/react-dialog` 1.1.23(MIT)을 `src/ui/PixelSheet.tsx` wrapper 안에서만 사용(단계 5, F10 지난 임시본 Sheet). Sheet는 Dialog를 시각 변형해 사용 |
| 아이콘·서체 | 자체 12×12 격자 SVG·Neo둥근모 self-host·시스템 본문 | `src/ui/pixel.tsx`, `public/fonts/neodgm/`, Asset Manifest AST-004~011. 외부 아이콘 팩 미포함, 실기기 확인 남음 |
| 모션·날짜 | CSS/Web Animations API, `Intl.DateTimeFormat`, 주입 `Clock` | Motion/date utility library 없음 |
| Mock·검증 | AIT Devtools, MSW 2, Vitest 5, RTL, user-event, axe-core, Playwright Chromium·WebKit, 실제 iOS·Android QR | MSW 2.15.0(postinstall 비허용, worker는 사용 slice에서 생성), Vitest 5.0.2(jsdom 30.1.1, `unit`·`contract` project), RTL 16.3.3, user-event 14.6.7, jest-dom 7.0.1, axe-core 4.13.0, Playwright 1.63.0(Chromium·WebKit). AIT Devtools는 Vite plugin 연결. 기기 QR 미실행 |
| 정적 품질·패키지 | TypeScript strict 옵션, Biome 2, Node 24 LTS, 고정 pnpm·lockfile | strict·`noUncheckedIndexedAccess`·`exactOptionalPropertyTypes`(`tsc -b`, noEmit), Biome 2.5.14 recommended, pnpm 12.6.0(`packageManager`)·`pnpm-lock.yaml`, `.nvmrc`=24·`engines` ≥24. 로컬 확인 Node는 25.2.1이며 Node 24 실행 증거·CI 없음 |
| 오류·분석 | Replay·PII를 끈 최소 Sentry, ARCA OP-014 | 실제 DSN·환경값 없음; 비밀값은 문서 범위 아님 |

프로젝트 생성 시점의 공식 템플릿·SDK·peer dependency를 확인하고 정확한 버전을 lockfile로 고정합니다([D-TECH-008 · L64](./DECISIONS.md#4-기술-스택-결정)). 월 1회 검증 후 업데이트합니다. Radix는 ARCA wrapper 밖에서 직접 import하지 않습니다.

정적 검사는 TypeScript `strict`·`noUncheckedIndexedAccess`·`exactOptionalPropertyTypes`, `tsc --noEmit`과 Biome 2를 사용합니다. GitHub Actions에서 정적 검사·테스트·빌드·브라우저 스모크를 수행하며 `.ait`·비공개 source map 업로드는 보호된 수동 workflow로 분리합니다. 실제 하네스 명령·CI 구성의 검증 증거는 §13.2에 연결합니다.

SDK 출시 제약은 [플랫폼 기준 §3 · L30–34](../../spec/platform/ARCA_APPS_IN_TOSS_FEATURES.md#3-출시-전-플랫폼-확인)을 따릅니다. SDK 3.x 출시 뒤 2.x 롤백 제한을 고려해 QR 실기기 검증을 통과한 번들만 출시합니다.

### 2.3 공식 플랫폼 사실과 fallback

2026년 9월 13일 확인한 공식 문서와 승인 방향은 다음과 같습니다. 2026년 9월 27일 설치한 `@apps-in-toss/web-framework` 3.5.0의 runtime export 존재만 확인했으며 WebView 동작·실패 경로는 해당 slice와 08에서 확인합니다.

| capability | adapter 정책 | 확인 자료·미확인 범위 |
|---|---|---|
| 익명 식별 | [`getAnonymousKey`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EB%B9%84%EA%B2%8C%EC%9E%84/getAnonymousKey.html)만 사용. 실패 시 random ID·`localStorage` fallback 금지 | 3.5.0 export(function) 확인. WebView 동작 미확인 |
| 영속 저장 | 공식 [`Storage`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EC%A0%80%EC%9E%A5%EC%86%8C/Storage.html)만 사용 | string key/value와 Promise API는 확인. 3.5.0 export: `getItem`·`setItem`·`removeItem`·`clearItems`와 `getItems`·`setItems`. 다중 key 호출의 원자성·key 열거는 확인되지 않았으므로 §8.2 교대 사본 순서를 유지 |
| Safe Area | [`SafeAreaInsets`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%ED%99%94%EB%A9%B4%20%EC%A0%9C%EC%96%B4/safe-area.html) 조회·구독, layout에만 CSS `env(safe-area-inset-*)` fallback | 3.5.0 `SafeAreaInsets.get`·`subscribe` 확인. 구형 `getSafeAreaInsets`에 새 의존 금지 |
| 네트워크·시간 | [`getNetworkStatus`·`getServerTime`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC/network.html)는 안내·재조회 timing에만 사용. 없으면 `navigator.onLine`·device clock도 advisory로만 사용 | 저장 가능 여부·KST 날짜 판정에 사용 금지 |
| Clipboard | 공식 [`setClipboardText`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%ED%81%B4%EB%A6%BD%EB%B3%B4%EB%93%9C/clipboard.html) → 사용자 gesture 안의 표준 Clipboard API → read-only 원문의 직접 선택·복사 순 | 권한·실기기 실패 경로는 08 검증 |
| 햅틱 | 지원 SDK를 최초 저장 성공에 한 번 호출, 실패·미지원은 no-op | 3.5.0 `generateHapticFeedback` export 확인. 성공 판단과 연출을 막지 않음 |
| 외부 문서·고객센터 | `ExternalNavigationPort`로 격리 | 3.5.0 `openURL` export 확인. 복귀 event·운영 URL 미확인 |

식별과 Storage에는 대체 저장소를 두지 않습니다. layout·복사·비필수 감각 피드백만 기능을 축소하는 fallback을 허용합니다.

### 2.4 픽셀 UI 선별 도입과 출처 추적

하나의 라이브러리로 제한하지 않습니다. [Pxlkit](https://github.com/Joangeldelarosa/pxlkit/tree/main/packages/ui-kit)과 [Pixelact UI](https://github.com/pixelact-ui/pixelact-ui)를 우선 비교하고, 필요한 요소를 ARCA 컴포넌트 안에 통합합니다(D-TECH-050). 후보 이름은 사용 의무가 아니며 다른 후보도 같은 기준으로 선택할 수 있습니다. 라이브러리의 기본 테마·예제 화면·게임 기능은 제품 요구가 아닙니다.

아래 표는 **비교 시작안**입니다. 전 행의 정확 버전·소스 편입·설치·실기기 검증은 미완료이며, 02의 CMP 계약이 선택보다 우선합니다.

| ARCA CMP | 후보·도입 방식 | 통합할 부분 |
|---|---|---|
| 001·002·003·025 셸·제목·배경·루트 탭 | 네이티브 HTML·플랫폼 adapter | Safe Area·스크롤·제목·플랫폼 외곽 규격 |
| 004·005·006·021 면·정적 Placeholder | Pxlkit의 면·테두리 표현 우선 비교, 필요 시 Pixelact UI 소스 또는 자체 CSS | Scene/Record/Inset 의미와 정적 로딩, ARCA 토큰 |
| 007·008·014 버튼·아이콘 행동·질문 전환 | Pxlkit 버튼을 시작안으로 Pixelact UI와 비교; 패키지 또는 필요한 소스 편입 | 네이티브 의미, 행동 위계·상태·단일 조작 |
| 009·010·011·012 Field·Input·Textarea·Checkbox | Pixelact UI 소스와 Pxlkit 입력 외형 비교; 네이티브 control을 유지하는 구현 선택 | §10.6의 값·IME·EGC·오류·ref 계약 |
| 017·018 AlertDialog·Sheet | 공통 Radix wrapper에 선택한 픽셀 외형 적용 | §10.1의 포커스·Back·dismiss·mutation 잠금 |
| 019·020·022 Toast·InlineStatus·StatePanel | 후보의 시각 요소와 ARCA 상태 조합 | 04의 문구·노출 조건·발표 우선순위 |
| 013·015·016·024 SEMA·기억 행·누적 수·형성 | ARCA 도메인 조합과 생성/제작 에셋 | 실제 질문·응답 DOM, 도메인 의미·사건 기반 연출 |
| 023 아이콘 | Asset Manifest AST-008의 선별 목록 | 같은 의미에 같은 그림, 02의 격자·선 굵기·표시 크기 |

- 각 CMP를 채택할 때 이 표의 해당 행에 **실제 출처 URL·package/원본 경로·정확 버전 또는 commit·도입 방식·로컬 구현 경로·수정 이유·검증 증거**를 연결합니다. 한 행의 출처가 갈리면 해당 CMP만 나눕니다. 별도 출처 문서나 전체 라이브러리 코드를 명세에 생성하지 않습니다.
- package 사용은 공개 export와 CSS 진입점·React peer·전이 의존성을 확인합니다. 소스 편입은 필요한 component/helper/style만 가져오고 원문 라이선스·저작권 고지·upstream 위치를 보존합니다. 문서 사이트와 예제 앱의 의존성을 그대로 옮기지 않습니다.
- 단계 1 인테이크(2026-09-27, CMP 채택 아님): `@pxlkit/ui-kit` 2.1.1은 MIT·React ^18.2‖^19 peer, 단일 root export와 Tailwind v4 `styles.css`(`@import "tailwindcss"`·`--retro-*` 테마)를 제공합니다. `react-table`·`embla-carousel`·`react-hook-form`·`@pxlkit/gamification`이 직접 의존성이고 `sideEffects` 선언이 없어, Vite 8 production에서 `PixelButton` 하나만 import해도 JS가 +343 KB(min)·+97 KB(gzip) 늘었습니다. 따라서 root package import는 쓰지 않고 필요한 component 소스 편입을 기본으로 비교합니다. Pixelact UI는 npm 배포가 아닌 shadcn registry 소스(MIT, commit `165eacd`, 2026-07-29)이며 Radix·Tailwind v4·`class-variance-authority`를 사용합니다. 두 후보 모두 Tailwind v4 구성을 요구합니다. 현행 자체 CSS 구현에는 도입하지 않았고, 추후 후보를 실제 도입할 때만 §2.5의 layer를 검토합니다.
- 단계 3 구현(2026-09-27): CMP-001·002·004·005·006·007·008·009/011·015·016·020·021·022·025는 외부 소스 편입 없이 네이티브 HTML과 ARCA 토큰으로 `src/ui/components.tsx`·`ui.css`에 구현했고, CMP-017은 위 Radix wrapper입니다. 선택 이유는 네이티브 의미·IME·ref 계약 보존과 인테이크의 번들 측정입니다. 계단형 모서리·자체 픽셀 아이콘(AST-008)·Neo둥근모 self-host·CMP-024 형성은 2026-09-28 현행 UI에 통합됐으며 별도 외부 후보 편입 없이 유지합니다(02 §13.3).
- 현행 UI 채택(2026-09-28, 운영 출시 승인과 구분): 외부 소스 편입 없이 `ui.css`에 계단형 픽셀 프레임(`.arca-px`: 2px 선·1셀 계단, background 레이어로 그려 포커스 링·hit area를 자르지 않음)과 plain 2단 실루엣(`.arca-plain`)을 구현하고 CMP-007/010/011/012/017/018/025에 적용했습니다. Neo둥근모는 `public/fonts/neodgm/` self-host·`font-display: swap`이며 F00 종료 조건이 아닙니다. 아이콘·JOY·기억 조각·인트로 장면은 `src/ui/pixel.tsx`의 격자→SVG 코드 원본(AST-004~008 `검토 중`)입니다. CMP-024는 CSS `steps(4)` 장식 연출로 결과 표시를 지연시키지 않습니다. 브라우저 전후 비교·현행 값은 02 §13.3·08 §14.1에 기록했으며 실기기 검증은 남아 있습니다.
- 선택 기준은 필요한 상태/컴포넌트 충족, 실제 React·WebView 호환, 최근 유지보수·테스트와 알려진 문제, 수정 부담·접근성·실제 번들 비용·사용 조건입니다. 패키지 크기나 컴포넌트 개수만으로 성능·품질을 판단하지 않습니다.
- 패키지 갱신과 편입 소스의 upstream 변경은 채택본·로컬 수정과 비교해 반영합니다. 업데이트마다 해당 CMP의 입력/Overlay/시각 회귀를 확인하며 편입 소스가 자동 갱신된 것으로 취급하지 않습니다(D-TECH-054).

2026-09-28 현행 표현은 `src/ui/tokens.css`·`ui.css`·`components.tsx`·`pixel.tsx`와 화면 JSX를 기준 원본으로 사용합니다. 직접 제작한 격자 SVG와 self-host Neo둥근모를 사용하며 이번 정리에서 외부 UI·폰트·아이콘 의존성을 추가하지 않았습니다. 화면 진입은 공통 shell의 CSS opacity 애니메이션만 사용하고 라우트·상태·포커스 timing을 변경하지 않습니다. 수치·역할의 원본은 02 §3~§9, 비교·실행 증거는 08 §14.1입니다.

### 2.5 공통 스타일과 의존성 경계

- 색·서체·간격·형태·모션 수치의 SSOT는 [02 Design System · L1–24](./02_DESIGN_SYSTEM.md)입니다. 외부 theme 변수와 Tailwind theme는 ARCA 의미 기반 CSS 변수를 참조하는 매핑으로 연결하고 별도의 값 정본을 두지 않습니다.
- 선택한 소스가 요구하는 Tailwind 빌드 구성을 허용합니다. 현재 비교 후보의 Tailwind v4 구성은 실제 template·WebView와 함께 확인해 고정합니다. 선택한 UI는 해당 CSS/Tailwind 경로로 구현합니다. Emotion은 이를 보완할 필요가 확인된 자체 컴포넌트에만 사용합니다(D-TECH-051).
- reset/preflight·theme·component 스타일을 한 진입점에서 조립합니다. reset 중복과 전역 body/button/input 오염을 제거하고 외부 변수/selector는 ARCA 소유 범위로 제한합니다. portal에도 같은 theme를 전달하고 플랫폼 소유 UI에 앱 스타일이 번지지 않게 합니다.
- CSS layer와 주입 순서를 고정하고 비계층 Emotion 규칙까지 포함해 실제 우선순위를 확인합니다. 같은 요소·상태의 속성을 여러 엔진에서 경쟁적으로 덮어쓰거나 반복적인 `!important`로 통합하지 않습니다.
- 외부 기본 폰트·원격 Google Fonts import·자동 테마 감지/영속화·전역 모션은 제거하거나 ARCA 정책으로 연결합니다. 앱은 기존 단일 테마·역할별 self-host/시스템 서체·SDK Storage 경계를 따릅니다.
- 허용된 개별 export와 필요한 CSS만 포함하는지 production build에서 확인합니다. 미사용 테이블·캐러셀·게임 기능·form 엔진, 중복 Radix와 스타일 runtime의 실제 포함 여부를 점검합니다. 제거 효과가 없거나 수정 비용이 크면 필요한 소스 편입/네이티브 구현과 비교합니다. tree shaking 성공을 사전 가정하지 않습니다.

## 3. 최소 구조와 의존 방향

### 3.1 모듈 경계

```text
src/
  app/                 composition root, bootstrap, routes, lifecycle, NavigationContext
  scenes/              F10~F12 공통 장면 layout·geometry·motion
  screens/
    onboarding/        F01~F03
    today/             F10~F13
    archive/           F20~F23
    settings/          F30~F31
    error/             F90
  domain/
    session/           session epoch·generation 적용 판정
    commands/          operation journal·복구·target lock
    drafts/            draft identity·7일 만료·쓰기 상태
    analytics/         allowlist event queue
  data/
    api/                generated wire 경계·ArcaApi 변환·오류 정규화
    query/              query key·조회 hook·cache 반영
    storage/            Storage journal·manifest·codec
  platform/             Apps in Toss capability adapter
  ui/                   02의 CMP 구현, 선별 외부 UI·편입 소스와 ARCA wrapper
```

외부 UI import·편입 소스는 `ui/` 내부에 두고 화면은 ARCA CMP를 사용합니다. 외부 UI가 domain·API·SDK Storage·분석을 직접 호출하지 않으며 값과 행동은 기존 hook/use case로 연결합니다.

이는 책임 배치 시작안이며 파일 수 의무가 아닙니다. 화면마다 store, API service, Storage 체계 또는 QueryClient를 만들지 않습니다. 단순한 화면 상태는 화면 가까이에 두고 두 화면 이상이 공유하거나 앱 lifecycle을 넘어야 하는 책임만 공통 모듈로 올립니다.

### 3.2 의존 방향

```text
screen + UI
    ↓ domain use case / hook
    ↓ ArcaApi · DraftStore · CommandStore · PlatformPort
    ↓ HTTP · SDK Storage · Apps in Toss adapters
```

- 화면은 `OP-*`의 사용자 조작을 use case로 호출하지만 URL·DTO를 알지 않습니다.
- `data/api/generated`는 구현 시 OpenAPI에서 파생하는 wire 전용 영역이며 손으로 편집하지 않습니다.
- `ArcaApi`가 wire validator 통과 결과를 domain model로 바꿉니다. server message와 알 수 없는 payload를 화면에 전달하지 않습니다.
- Query hook은 `ArcaApi`만 호출합니다. command mutation은 컴포넌트가 아닌 `CommandCoordinator`가 소유합니다.
- `PlatformPort`는 익명 키, Storage, clipboard, haptic, safe area, network, clock, lifecycle, 외부 열기를 노출합니다. 화면은 SDK를 직접 import하지 않습니다.

### 3.3 composition root

앱 시작 시 한 번 다음 객체를 조립합니다.

1. 실제 또는 Mock `PlatformPort`
2. native fetch 기반 HTTP transport와 `ArcaApi`
3. persister가 없는 `QueryClient`
4. `SessionController`, `StorageJournal`, `DraftRepository`
5. `CommandCoordinator`, 메모리 전용 `NavigationContext`와 `AnalyticsQueue`
6. React Router와 앱 lifecycle bridge

React Provider가 가지는 전역 반응 상태는 `bootstrap phase`, 현재 session mode, session epoch, data generation, 전체 삭제 recovery gate의 요약뿐입니다. access token은 `SessionController`의 메모리에만 있고 React state·Query cache·Storage·URL·오류 context에 복사하지 않습니다. command의 정본은 Storage tracker와 서버이며 Provider는 화면 잠금에 필요한 파생 요약만 구독합니다.

F10·F11·F12는 route를 유지한 채 `DailySceneLayout`을 공유합니다. 같은 질문 identity의 위치·폭과 작성 surface를 이어받고, 질문·날짜·콘텐츠 변경에는 문맥을 교체합니다. layout은 geometry·motion만 소유하며 DTO·본문·draft를 복제하지 않습니다. 본문은 활성 route의 실제 텍스트/입력 DOM으로 표시하고 퇴장 장면에 복제본을 남기지 않습니다. 입력·포커스·완료 표시는 모션/에셋을 기다리지 않으며 Reduced Motion은 즉시 전환합니다(D-TECH-039).

### 3.4 API 파생과 오류 정규화

실제 구현 단계에서는 05가 가리키는 OpenAPI 원본에서 wire TypeScript 타입과 Zod validator를 파생합니다. 생성 영역은 재생성 가능해야 하고 수동 patch를 금지합니다. 구체 generator는 다음을 모두 만족하는 후보를 실제 저장소에서 비교한 뒤 고정합니다.

- OpenAPI 3.1.1과 당시 고정한 TypeScript·Zod 4 호환
- 05의 닫힌 enum/이벤트 allowlist와 unknown field 호환 정책 표현
- runtime response validation, nullable·optional 구분, discriminated union 보존
- 생성물에 실제 host·비밀값·Mock fixture를 내장하지 않음

화면이 받는 오류는 다음 네 갈래입니다.

| 분류 | 의미 | 화면 처리 |
|---|---|---|
| `TransportFailure` | 연결·DNS·timeout·client Abort | safe query 재조회 또는 command 결과 미확인. 미적용 추정 금지 |
| `ProtocolFailure` | 예상 status/envelope/schema 불일치 | 안전한 로컬 오류 ID와 재조회. raw body·server message 보고 금지 |
| `DomainFailure` | 05의 안정 code·category·request ID | code를 04의 상태·문구에 매핑. request ID는 허용된 지원 표시 외 분석 금지 |
| `LocalPersistenceFailure` | draft·tracker·proof read-back 실패 또는 손상 | 입력 유지·복사·재보관. 서버 mutation 선전송 금지 |

`AbortController`는 프런트가 응답 대기를 중단하는 수단입니다. safe query의 대체·unmount에는 사용할 수 있으나 command가 서버에서 취소됐다는 뜻으로 표시하지 않습니다.

## 4. 상태 소유권과 적용 가능성

### 4.1 단일 소유권

| 상태 | 정본 소유자 | 메모리 표현 | 영속 여부 |
|---|---|---|---|
| 승객·오늘·답변 목록·상세·활성 수 | ARCA 서버 | TanStack Query cache | 영속 cache 금지 |
| access token·expiresAt | SessionController | 메모리 전용 | 금지 |
| session mode·epoch·generation | OP-001 결과 + SessionController | 앱 Provider의 최소 요약 | token 없이 root manifest에 현재 generation·route epoch만 보관 가능 |
| 질문 선택·커서/선택 범위·스크롤·복귀 대상 | 활성 화면; 이탈 시 NavigationContext snapshot | 메모리, §5.6 | 영속 금지 |
| Overlay·키보드·F12 행동 위계 | 해당 화면 | React local state | 비영속 |
| 현재 편집 문자열 | F11·F22 화면 | controlled input state | draft record에도 마지막 확인본을 보관하되 화면 값이 편집 중 최신값 |
| 신규·수정 임시본 | 기기 DraftRepository | 화면 load 뒤 local state | SDK Storage, 마지막 수정 후 7일 |
| command operation·ticket·고정 payload·최소 proof | CommandStore + 서버 result | CommandCoordinator 파생 상태 | SDK Storage, §8 수명 적용 |
| 제품 이벤트 대기열 | AnalyticsQueue | 메모리 | 영속 금지 |

Query 결과를 별도 Context나 archive store에 복사하지 않습니다. 화면에서 정렬·월 구획·버튼 위계처럼 필요한 값은 query/domain model에서 파생합니다. draft의 화면 값과 Storage 확인본은 목적이 다르므로 둘의 `editVersion`과 `persistedVersion`을 비교해 정직한 보관 상태를 표시합니다.

### 4.2 session epoch와 generation fence

각 request는 시작할 때 `{ownerScope, sessionEpoch, dataGeneration}` snapshot을 붙여 내부적으로 추적합니다. ownerScope는 §6.1의 메모리 주체 구획이며 인증 정보가 아닙니다. 응답 적용 전 다음을 확인합니다.

1. request의 ownerScope와 요구 session mode가 현재와 맞는가
2. session epoch가 같은가
3. ACTIVE resource면 data generation이 같은가
4. answer presentation이면 `sourceRevision`, count면 `observedAt`이 적용 대상과 맞는가
5. full deletion recovery면 일반 ACTIVE 요청이 아니라 해당 제한 session·ticket인가

하나라도 맞지 않으면 화면·Query cache·Storage manifest에 적용하지 않습니다. 이전 generation의 늦은 응답은 새 기록을 만들거나 새 cache를 지울 수 없습니다. 전체 삭제 terminal 처리는 정상 epoch가 폐기된 뒤에도 해당 deletion tracker와 제한 session의 조합으로만 예외 처리합니다.

### 4.3 target lock

mutation은 논리 대상별로 직렬화합니다.

| target | 포함 작업 | 잠금 범위 |
|---|---|---|
| `dailySema:{dailySemaId}` | 신규 저장 | 같은 배포 단위의 새 저장·질문 전환 |
| `answer:{answerId}` | 수정·개별 삭제 | 같은 답변의 수정·삭제·수정 임시본 폐기 |
| `profile` | 닉네임 설정·해제 | 닉네임 mutation만 |
| `generation:*` | 모든 데이터 삭제 | 모든 새 mutation과 기존 PREPARED 실행 |

다른 답변 읽기·목록 탐색·설정 열기는 유지합니다. 전체 삭제 prepare 전에 호환되지 않는 미결 command가 없어야 하며, 서버의 deletion fence가 최종 판정합니다. 컴포넌트 unmount는 lock을 해제하지 않습니다.

## 5. 라우팅과 앱 시작

### 5.1 route 표

| 화면 | route 시작안 | 진입 조건·필수 context | Back·성공 이탈 |
|---|---|---|---|
| F00 | `/` | 모든 cold start. 사용자 조작 없는 bootstrap | PRE→F01, ACTIVE→F10, 실패→F90을 `replace` |
| F01 | `/intro` | PRE_PASSENGER | root Back은 플랫폼 종료, 완료→F02 |
| F02 | `/join` | PRE_PASSENGER와 OP-001 정책 | Back→F01, OP-003 ACTIVE 성공→F03 `replace` |
| F03 | `/join/complete` | ACTIVE와 현재 탑승 continuation | 빈 값·저장 성공·승인된 건너뛰기→F10 `replace` |
| F10 | `/today` | ACTIVE | 루트 탭·설정, root Back은 플랫폼 정책 |
| F11 | `/today/write` | ACTIVE, `history.state`의 질문 ref와 OP-005 문맥 | 안전 이탈→F10, 현재 화면 성공→F12 |
| F12 | `/today/saved` | 현재 방문의 확인된 신규 저장 completion model | Back/행동→F10 또는 F20. context 없으면 F10 |
| F13 | `/today/drafts` | `history.state`의 draft ref | Back·오늘 이동→F10. ref 없으면 F10 |
| F20 | `/archive` | ACTIVE | 루트 탭·설정, row→F21 |
| F21 | `/archive/detail` | `history.state`의 answer ref | Back→F20, 수정→F22, 삭제→F23 |
| F22 | `/archive/edit` | answer ref와 OP-011 detail | 안전 이탈/취소→F21, 성공→F21 |
| F23 | `/archive/detail/delete` | answer ref, F21을 배경으로 한 논리 modal route | 취소→F21, 성공→F20 `replace` |
| F30 | `/settings` | ACTIVE | Back은 진입한 F10/F20, 전체 삭제→F31 |
| F31 | `/settings/delete` | ACTIVE | 취소→F30, 성공 뒤 local 정리→F01 |
| F90 | `/error/start` | F00의 안전한 오류 분류 | 재시도→F00 `replace`, 지원 연결 |

URL에는 answer/question ID, dailySemaId, operation/ticket ID, token, 닉네임, 본문·발췌를 넣지 않습니다. `history.state`에는 화면 전환에 필요한 opaque answer/question/draft ref와 민감하지 않은 `routeEpoch`만 허용합니다. 본문·발췌·닉네임·token·ticket은 route state에도 금지합니다. 새로고침으로 ref가 사라지면 부모 route로 안전하게 돌아가 서버/Storage에서 다시 선택하게 합니다.

F00은 `/` 화면인 동시에 모든 route 앞의 bootstrap boundary입니다. 앱이 `/today` 같은 semantic route에서 다시 열려도 대상 화면을 먼저 렌더링하지 않고 F00 상태를 표시해 session·generation·recovery를 확인한 뒤 route guard를 통과시킵니다.

### 5.2 Back과 Overlay

1. 열린 AlertDialog를 안전 행동으로 닫습니다.
2. 열린 Sheet/Dialog를 닫고 trigger focus와 배경 scroll을 복원합니다.
3. IME 조합을 확정하지 않은 채 값을 바꾸지 않습니다. 키보드가 열린 Android Back은 키보드만 닫습니다.
4. 하위 route는 표의 부모로 이동합니다.
5. F10·F20 root에서 플랫폼 종료 정책을 적용합니다.

F23은 Radix AlertDialog wrapper와 route가 같은 open state를 공유합니다. 삭제 실행 중에는 dismiss·Back을 잠급니다. F11·F22는 결과 조회 예산과 화면 잠금을 분리합니다. §8.6의 보관 조건을 충족하면 요청 대기 중에도 이탈을 열며 같은 target의 경쟁 mutation 잠금은 유지합니다.

### 5.3 bootstrap 순서

```text
앱 셸·adapter → SDK 익명 키 → OP-001 single-flight
→ 주체·session mode·epoch·generation 확정
→ recentDeletion/이전 영역 정리·삭제 recovery gate
→ 현재 root/manifest의 유효 사본 선택
→ 병행: route query / 현재 target tracker·draft 검사
→ 통과한 화면 표시·조작 허용
→ 첫 화면 이후: 비대상 만료 청소·다른 target 복구
```

1. 익명 키 실패에는 OP-001을 보내지 않고 F90으로 갑니다. OP-001은 passenger를 만들지 않으며 PRE_PASSENGER는 onboarding만 엽니다.
2. OP-003의 ACTIVE session을 즉시 이어받습니다. 생성 응답 유실은 같은 operation ID·입력으로 복원합니다.
3. 주체·generation·권한 확인 전 과거 private cache를 표시하지 않습니다. recentDeletion은 old 영역만 정리하며 새 generation을 지우지 않습니다.
4. DELETION_RECOVERY는 앱 전체 gate입니다. 해당 deletion의 OP-008·009와 로컬 정리 외 일반 query·mutation을 열지 않습니다.
5. 유효 root/manifest 선택 뒤 route query와 현재 target 검사를 병행합니다. 검사 전 관련 작성·변경을 잠그고 미결 tracker가 있으면 평범한 Data/작성보다 복구 상태를 먼저 표시합니다. 검사 실패를 안전한 빈 상태로 가장하지 않습니다.
6. 비대상 청소는 첫 화면 뒤로 미룹니다. 직접 열거나 목록에 노출할 draft는 먼저 만료·소유권·pending 상태를 검사하므로 만료 본문을 표시하지 않습니다.
7. 다른 target은 최대 2개씩 background 확인합니다. 현재 target을 우선하고 같은 command의 Coordinator single-flight에 합류합니다. 전체 복구 완료를 첫 화면의 조건으로 삼지 않습니다.
8. 무효 route는 부모 root로 replace합니다. 이전 영역 정리 실패·root 양쪽 손상은 비대상 청소로 미룰 수 없습니다(D-TECH-041).

### 5.4 세션 수명과 재발급

- OP-001은 동시에 하나만 실행합니다. 모든 caller가 같은 Promise를 공유합니다.
- proactive 재발급은 foreground 진입과 request 직전에 수행합니다. 초기 여유값은 `min(60초, 관찰한 token TTL의 10%)`이며 실제 TTL·clock skew 증거로 조정합니다.
- device/server time은 선제 갱신 힌트일 뿐입니다. 서버가 지정한 `SESSION_RECOVERY_REQUIRED`만 자동 복구를 시작합니다.
- 동일 사용자 행동은 세션을 한 번 재확립한 뒤 최대 한 번만 재요청합니다. 재요청 metadata로 무한 loop를 막습니다.
- 재확립 결과 generation이 바뀌면 이전 mutation을 자동 재실행하지 않습니다. 이전 tracker를 격리하고 현재 generation의 query만 새로 시작합니다.
- token은 reload·background 장기 중단·전체 삭제 성공 때 폐기합니다. refresh token을 추가하지 않습니다.
- 동일 주체·generation·권한의 정상 갱신은 epoch만 교체하고 cache·탐색 문맥을 유지합니다. 이전 epoch 응답은 거절하고 필요한 조회/command 복구를 현재 epoch로 수행합니다. 주체 확인 실패·권한 변경은 private 화면을 차단하고 관련 메모리를 폐기합니다.

### 5.5 history와 generation 변경

각 history entry는 로컬 `routeEpoch`만 갖습니다. generation 변경·전체 삭제 성공 시 새 route epoch를 만들고 이전 epoch entry는 guard에서 현재 안전 root로 `replace`합니다. 전체 삭제 뒤에는 메모리 completion model, NavigationContext, answer/draft ref, Query cache, Overlay·공통 장면 state를 제거한 뒤 F01로 교체합니다. WebView가 과거 history 자체를 물리적으로 제거한다고 가정하지 않으며, stale entry가 다시 열려도 bootstrap/guard가 삭제된 내용을 렌더링하지 않는 것으로 보호합니다.

### 5.6 NavigationContext의 수명과 복원

`NavigationContext`는 `{ownerScope, generation, routeEpoch, route, opaqueRef}`별 질문 선택·UTF-16 selection·scroll anchor/offset·복귀 대상·확인할 edit/revision 식별만 메모리에 보관합니다. 본문·발췌·질문 원문·닉네임·token·ticket과 Query/draft 정본을 복제하지 않습니다. Overlay·키보드 열림·F12 행동 위계도 옮기지 않습니다.

활성 화면이 조작 상태를 소유하고 이탈 때 snapshot을 넘깁니다. 복귀 시 서버/Storage의 identity·revision/editVersion 검증 뒤 초기화하고 layout 다음 frame에 유효 selection·anchor를 복원합니다. 값이 바뀌었으면 선택 범위를 강제 적용하지 않습니다. 재조회는 사용 중인 조작 상태를 덮지 않고 키보드를 자동 재개하지 않습니다. route 제목 포커스 등 04 IX-018은 유지합니다.

같은 방문의 왕복에는 유지하고 대상 삭제·draft 폐기는 해당 ref를 제거합니다. reload·주체/권한/generation/routeEpoch 변경·private cache 폐기 때 함께 지웁니다. 재실행의 본문 복원은 DraftRepository만 담당합니다(D-TECH-040).

## 6. Query, cache와 목록

### 6.1 key와 소유 범위

모든 private query key는 메모리 주체 구획 ownerScope와 generation을 포함합니다. ownerScope는 확인한 익명 주체에 대해 SessionController가 만든 random ref이며 익명 키·token·passenger code를 포함하거나 영속화하지 않습니다. 같은 주체·generation·권한의 정상 갱신에는 유지하고 변경/확인 실패에는 cache를 폐기합니다. epoch는 응답 fence이며 cache identity가 아닙니다(D-TECH-042). 의미 시작안은 다음과 같습니다.

| 데이터 | query key 의미 | 소비 화면 |
|---|---|---|
| 오늘 정본·활성 수 | `arca/{ownerScope}/{generation}/today/{excerptProfile}` | F00·F10·F12·F20 |
| 승객 profile | `arca/{ownerScope}/{generation}/passenger` | F03·F30 |
| 기록 page chain | `arca/{ownerScope}/{generation}/answers/{excerptProfile}` | F20 |
| 답변 상세 | `arca/{ownerScope}/{generation}/answer/{answerId}` | F21~F23 |

실제 배열 문자열은 구현에서 상수 factory로 만들며 화면이 조립하지 않습니다. OP-001은 SessionController, OP-008은 CommandCoordinator가 소유하므로 일반 화면 Query cache의 정본으로 중복 보관하지 않습니다. 모든 private HTTP 응답은 `no-store`를 따르고 service worker·Cache API에 저장하지 않습니다. TanStack Query의 메모리 cache는 HTTP cache와 다르지만 앱 background 종료·주체/권한/generation 변경 시 제거합니다. 정상 갱신의 기존 확인본은 유지하되 이전 epoch 요청을 취소/무효화하고 현재 epoch 재조회와 revision·observedAt 판정을 적용합니다. 이전 응답은 cache를 덮지 못합니다.

### 6.2 freshness·중복·취소

- interval polling은 사용하지 않습니다. `staleTime`에 제품 의미를 싣지 않고 route entry, foreground, KST 경계 힌트, mutation terminal, conflict를 명시적 재조회 사건으로 사용합니다.
- F10은 진입·foreground·KST 날짜 경계 힌트에 OP-005를 재조회합니다.
- F20은 page chain을 유지하면서 탭·F12 등 root 진입 시 첫 page를 background refresh합니다. F21에서 Back한 직후에는 기존 chain·anchor 복원을 우선합니다.
- F21·F30은 진입과 revision conflict 뒤 재조회합니다.
- 같은 key safe query는 TanStack Query가 합칩니다. 대체 query/unmount는 Abort할 수 있습니다.
- safe query transport timeout 시작값은 8초, transport retry는 연결성 오류에 한해 최대 1회입니다. command mutation은 계약에 없는 자동 재시도를 하지 않습니다.
- 늦은 응답은 §4.2 fence를 통과한 경우만 cache에 들어갑니다.

### 6.3 F20 page chain과 누적 수

F20 목록은 generation별 하나의 infinite page chain입니다. OP-010의 cursor와 최대 20개 경계를 그대로 사용합니다.

- 월 구획은 page를 합친 최신순 row에서 KST 작성 연월로 파생하며 별도 저장하지 않습니다.
- page 경계의 같은 월 제목은 한 번만 렌더링합니다.
- row key로 방어적 중복 제거를 하되 서버 정렬을 재작성하지 않습니다.
- 추가 loading은 기존 row와 scroll을 유지합니다. cursor 오류면 새 cursor를 추측하지 않고 기존 chain을 보존한 채 첫 page 새로고침을 제공합니다.
- 상세 진입 때 `{anchorAnswerRef, viewportOffset}`을 NavigationContext에 두고 Back에서 복원합니다. history.state에는 허용된 opaque ref/routeEpoch만 두며 영속 scroll cache를 만들지 않습니다.
- 수정 성공은 현재 load된 같은 row만 revision이 일치할 때 patch합니다. 삭제 성공은 row와 비게 된 월 제목을 제거하고 anchor를 인접 row로 옮깁니다.
- 새 답변은 기존 cursor chain 중간에 삽입하지 않습니다. F20 재진입·명시적 root refresh 때 첫 page부터 새 chain을 구성합니다.
- 첫 page refresh 중에는 기존 chain을 표시하고 새 first page와 기존 tail cursor를 섞지 않습니다. 깊은 scroll의 읽던 위치를 바꾸는 후보는 최신 first page 하나만 메모리에 보류합니다.
- 보류 후보가 있으면 04 IX-042의 작은 갱신 안내와 `최신 기록 보기`를 제공합니다. 선택하면 상단으로 이동하며 새 chain으로 교체하고 첫 기록/목록 제목에 포커스를 둡니다. 선택 전에는 행·scroll·focus를 유지합니다. 직접 상단으로 돌아왔을 때도 적용할 수 있으나 focus를 강제 이동하지 않습니다.
- 새 후보는 이전 후보를 대체합니다. mutation·주체/generation 변경·cursor 무효화로 낡은 후보는 폐기하고 재조회합니다. 후보 부재/실패에는 안내를 숨기고 새 기록의 수나 존재를 추정하지 않습니다. 확인된 첫 page의 identity·revision·순서가 같으면 반복 갱신 안내를 만들지 않으며 새 cursor를 기존 tail에 섞지 않습니다(D-TECH-048).
- `CMP-016 MemoryCount`는 OP-010에서 추정하거나 row 수로 계산하지 않습니다. F20은 OP-005의 `activeAnswerCount`를 독립 조회하고 목록은 count 실패와 무관하게 표시합니다.

F20은 OP-010의 `question`·`createdDateKst`로 질문·날짜만 그립니다. 기존 STANDARD 발췌 DTO·요청·캐시·revision 동기화는 호환을 위해 유지하며 목록 DOM/접근성 이름에 본문을 넣지 않습니다. 상세를 선택했을 때 기존 OP-011 경로로 응답 전문을 읽습니다.

### 6.4 terminal mutation 뒤 동기화

공통 순서는 `terminal 검증 → 최소 proof 로컬 반영 → 적용 가능한 현재 view patch → 필요한 query 무효화/재조회 예약 → 민감 로컬 정리 → ack`입니다. 단계별 재개는 §8.7을 따르며 읽기 재조회 성공을 ack의 선행 조건으로 만들지 않습니다.

| 결과 | 즉시 반영 | background 재조회 |
|---|---|---|
| 신규 저장 성공 | 해당 dailySemaId의 오늘 상태를 확인된 완료로 patch, 같은 배포 단위 create draft 제거, F12 completion model 생성 | OP-005, 다음 F20 진입의 첫 page |
| 수정 성공 | 고정 payload를 확인된 새 revision의 상세에만 patch, sourceRevision이 맞는 load row/오늘 발췌만 갱신, update draft 제거 | OP-011·010, 해당 today이면 OP-005 |
| 개별 삭제 성공 | 상세 cache 제거, load row와 빈 월 제목 제거. count 산술 추정 금지 | OP-010·005, 필요 시 OP-011 부재 확인 |
| 닉네임 성공 | receipt revision이 현재 적용 가능할 때 profile patch | OP-002 |
| `NOT_APPLIED` | 서버 정본 cache·입력 유지, target lock은 terminal proof 보관 후 해제 | 오류별 OP-005·011 |
| `RESOURCE_CHANGED` | 과거 presentation을 버리고 proof만 유지 | OP-005·010·011 중 현재 resource |
| 전체 삭제 성공 | §9.4의 전용 순서. 일반 cache patch 금지 | 다음 OP-001만 |

receipt 발췌는 proof revision과 `sourceRevision`이 같을 때만 사용합니다. 활성 수는 `observedAt`이 있는 서버 snapshot으로만 갱신합니다. 과거 receipt와 현재 다른 기기의 수정·삭제 결과를 결합하지 않습니다. 서버 성공 event는 FE가 OP-014로 다시 만들지 않습니다.

## 7. 입력과 임시 보관

### 7.1 draft identity

| 종류 | logical identity | 적용 규칙 |
|---|---|---|
| 신규 작성 | generation + dailySemaId + semaId/version + questionId/version | 같은 dailySemaId라도 콘텐츠·질문 version이 바뀌면 새 draft. 이전 본문 자동 전용 금지 |
| 수정 | generation + answerId + base revision | 다른 기기 수정으로 revision이 바뀌면 기존 draft를 자동 적용하지 않고 복사·폐기 가능한 stale draft로 분리 |

질문 원문, 답변 본문이나 닉네임을 key에 넣지 않습니다. logical identity는 Storage codec이 로컬 record ref로 변환하고 화면은 raw key를 알지 않습니다. 신규 저장 성공은 같은 dailySemaId의 교체 전 콘텐츠·두 질문 create draft를 모두 제거합니다. 수정 성공은 해당 answer/base revision draft만 제거합니다. 개별 삭제 성공은 그 answer의 모든 update draft를 제거하고, 전체 삭제 성공은 모든 generation record를 제거합니다.

### 7.2 입력 문자열과 IME

- input state는 사용자가 만든 UTF-16 문자열을 그대로 유지합니다. trim, NFC/NFKC 정규화, CR/LF 외관 재작성, 연속 공백 축약을 하지 않습니다.
- Unicode 확장 grapheme count는 `Intl.Segmenter` capability wrapper로 계산합니다. 실제 iOS·Android에서 미지원이면 code point count로 낮추지 않고 standards-compatible fallback library를 고정한 뒤 진행합니다.
- 표시용 `currentCount`는 현재 input state를 EGC로 세어 매 변경 즉시 갱신합니다. F11·F22는 `draft.text`, F03·F30은 `value.trim()`으로 계산하며 조합 종료·blur·Storage debounce를 기다리지 않습니다.
- `settledText` / `committed`는 조합 완료값의 오류·저장 가능 판정에만 사용합니다. `compositionstart~compositionend` 동안 초과 오류·제출·debounce commit은 확정하지 않고 종료 뒤 전체 문자열을 다시 검증합니다. 숫자 표시를 앞당겨도 저장 guard·draftWriter·이탈 보호는 변경하지 않습니다.
- 붙여넣기를 자동 절단하지 않습니다. 2,000 EGC를 넘으면 원문을 유지하고 오류와 초과 수를 표시하며 서버 저장만 막습니다.
- draft 복원 뒤 selection/cursor는 DOM 적용 다음 frame에 가능한 범위로 복원합니다. grapheme count와 cursor offset을 혼용하지 않습니다.
- F30 닉네임은 별도 draft를 만들지 않으며 04의 정규화·빈 값 의미만 적용합니다. 응답 원문 규칙을 닉네임에 역적용하지 않습니다.

### 7.3 자동 보관 timing

조합이 끝난 입력은 마지막 변경의 500ms trailing debounce와 최초 미보관 변경의 2초 maxWait 중 먼저 도달할 때 쓰기를 요청합니다. 새 타이핑은 maxWait 기점을 미루지 않습니다. 2초는 실제 Storage/IME 검증으로 조정할 시작값이며 쓰기 시작/예약 상한이지 I/O 성공 보장이 아닙니다.

IME 중에는 commit을 확정하지 않습니다. 기한이 지났으면 compositionend에서 최신 전체 문자열을 즉시 예약합니다. 같은 draft는 직렬로 쓰고 진행 중 새 버전은 최신 완료 입력으로 합쳐 다음 순번에 씁니다. 오래된 write 성공으로 최신 버전을 보관 완료 표시하지 않습니다.

질문 전환·Back/내부 이동·서버 저장 전 최신 버전을 flush/read-back합니다. 현재 generation의 동일 editVersion·정확한 문자열·유효 ready record가 이미 확인됐고 손상/무효화 사건이 없으면 중복 쓰기를 생략합니다. 확인이 없으면 쓰기/검증을 수행합니다. F22 폐기 확인 전에는 제거 대상만 확정합니다.

visibilitychange·page hide는 best-effort이며 강제 종료 보호나 성공을 보장하지 않습니다. 실패·계속 미확인의 이탈은 04 IX-007/036을 따릅니다. timing·버전 병합·중복 생략 모두 성공을 먼저 표시하는 근거가 아닙니다(D-TECH-043).

### 7.4 보관 상태와 만료

화면은 `editing`, `persisting`, `persisted(editVersion)`, `failed(editVersion)`을 구분합니다. 최신 edit version과 같은 serialized value를 Storage에서 읽어 검증한 뒤에만 기기 보관 성공으로 표시합니다.

- `expiresAt = lastModifiedAt + 7×24시간`이며 마지막 사용자 본문 수정만 기한을 연장합니다. 단순 열람·결과 조회·manifest repair는 연장하지 않습니다.
- bootstrap, F10 지난 임시본 열기, F11/F22/F13 load 때 만료를 청소합니다. platform timer가 정확히 실행된다고 가정하지 않습니다.
- device clock은 로컬 만료 표시·청소에 사용하되 뒤로 이동이 감지되면 조기 삭제하지 않고 마지막 관찰 시각보다 작은 시간을 clamp합니다. 서버 저장 가능 여부에는 사용하지 않습니다.
- JSON parse·version·필수 field 검증 실패는 빈 정상 draft로 가장하지 않습니다. 현재 입력이 있으면 유지하고 `LocalPersistenceFailure`를 표시합니다.

## 8. Storage journal과 command 복구

### 8.1 key와 record

root와 각 manifest는 A/B 고정 key를 사용해 열거 없이 복구합니다.

```text
arca:local:v1:root:{a|b}
arca:local:v1:pre:manifest:{a|b}
arca:local:v1:g:{generationRef}:manifest:{a|b}
arca:local:v1:r:{recordRef}
```

root는 current generationRef·routeEpoch·PRE/알려진 generation manifest·최소 deletion receipt를 가리킵니다. PRE는 OP-003 tracker만, generation manifest는 draft·command meta/payload·proof·정리 진척 ref를 관리합니다. token·익명 키 원문은 저장하지 않습니다.

PRE tracker에는 random salt와 SHA-256(salt || anonymousKey)의 localOwnerVerifier를 보관합니다. 새 익명 키의 계산값이 같을 때만 같은 OP-003을 복구하며 서버·분석·로그·오류로 내보내지 않습니다. ACTIVE 인계/전체 삭제 때 제거하고 Web Crypto 미지원이면 키 원문 저장으로 우회하거나 자동 재전송을 출시 완료로 인정하지 않습니다.

value는 `{schemaVersion, recordKind, generation, writeId, writtenAt, data}`로 직렬화·읽기 검증합니다. root/manifest에는 단조 증가 sequence와 결정적 직렬화 bytes의 checksum을 추가합니다. checksum은 우발 손상 검출용이며 인증·암호화·원자성을 보장하지 않습니다. schema/checksum/소유 영역이 유효한 높은 sequence를 선택하며 같은 sequence의 서로 다른 값·두 사본 손상은 LocalPersistenceFailure입니다. 두 key 부재는 복원 가능한 로컬 목록 부재로 취급하며 과거 본문/요청의 존재 여부나 보관 성공을 추정하지 않습니다. 알려진 root가 가리키는 manifest의 양쪽 부재/손상은 오류로 처리합니다. 알려진 version만 손실 없이 migration합니다.

### 8.2 교대 사본과 다중 key 쓰기 순서

Storage의 transaction·atomic replace를 가정하지 않습니다. StorageJournal 한 개가 root와 모든 manifest의 read-modify-write를 metadata 큐 하나로 직렬화합니다. target lock과 별개이며 큐 안에서 최신 사본을 읽어 다른 target의 ref를 보존합니다. 전체 삭제는 큐 barrier·generation fence로 늦은 쓰기를 차단합니다.

1. 최신 manifest에 새 writeId/recordRef를 pending으로 추가한 snapshot을 다른 슬롯에 쓰고 exact read-back/checksum을 확인합니다.
2. 독립 record를 쓰고 exact read-back/schema를 확인합니다.
3. 최신 snapshot에서 ready pointer를 교체하고 pending을 제거해 다른 슬롯에 쓰고 검증합니다. 초기화도 유효 사본 두 개를 확보합니다.
4. 이전 record는 두 유효 사본의 ready/pending 어디에서도 참조하지 않을 때만 제거합니다. 판단은 같은 metadata 큐에서 합니다.

시작 시 유효 pending record면 승격하고 없거나 손상됐으면 해당 pending만 정리합니다. 높은 사본 손상은 낮은 유효 사본에서 재개하며 확인 가능한 버전까지만 보관을 주장합니다. 전역 목록의 보관 완료는 ready 확인 뒤입니다. 알려진 ref의 record를 직접 repair할 때도 동일 소유 영역/generation·삭제 tombstone 부재를 검사합니다. 열거 불가능한 orphan을 모두 발견한다고 주장하지 않습니다.

삭제·terminal 정리는 두 유효 사본의 대상 제외/tombstone과 실제 record 제거를 확인한 뒤 완료합니다. 낮은 사본으로 복귀해 삭제 본문을 되살리지 않습니다. 교대 쓰기 중 종료·동시 target·양쪽 손상·삭제 barrier는 07/08 검증 대상이며 두 사본도 모든 매체 손실을 보장하지 않습니다(D-TECH-046).

### 8.3 mutation 선보관

사용자가 OP-003·004·006·012·013에 해당하는 행동을 확정하면 네트워크보다 먼저 다음을 수행합니다.

1. 현재 draft가 필요한 작업은 최신 본문을 flush하고 exact read-back합니다.
2. 새 operation ID와 변경되지 않는 prepare/input fingerprint를 command meta에 기록하고 read-back합니다.
3. answer write는 그 순간의 정확한 본문을 별도 command payload record로 고정하고 read-back합니다.
4. tracker가 `networkAllowed` 상태임을 확인한 뒤에만 첫 mutation을 보냅니다.

한 단계라도 실패·미확인이면 mutation을 보내지 않습니다. 입력·직접 선택·복사·재보관을 유지합니다. prepare 응답에서 ticket을 받으면 ticket meta를 read-back한 뒤에만 OP-007을 보냅니다. 따라서 execute 응답이 유실돼도 결과 조회에 필요한 ticket이 이미 기기에 있습니다.

### 8.4 command의 독립 상태 축

CommandCoordinator는 명시적인 상태 전이 함수와 I/O effect 실행을 분리합니다. 서버 응답·Storage 확인·사용자 행동·시간/lifecycle 사건으로 전이하고 화면은 파생 상태를 받습니다(D-TECH-045).

| 축 | 상태·소유 | 적용 규칙 |
|---|---|---|
| 서버 판정 | 서버/proof: UNCONFIRMED, PREPARED, EXECUTING, SUCCEEDED, NOT_APPLIED, CLOSED_OUTCOME_UNAVAILABLE | UNCONFIRMED만 판정 부재를 뜻하는 로컬 상태. 서버 의미는 05, terminal 비역행 |
| 로컬 보관·마무리 | journal: STAGING, RECOVERABLE, proof 확인, view/재조회 예약, 민감 record 정리, ack 시도/확인 | 단계별 진척에서 재개. 메모리 view 적용은 재시작 뒤 반복 가능 |
| 방문별 피드백 | 현재 route/방문과 별도 알림 처리 표식 | 처리 중·미확인·성공·연출 자격·안전 이탈 파생. 알림 완료와 로컬 정리 완료는 독립 |

PREPARING·execute 응답 대기·LOCAL_FINALIZING은 진행 effect에서 파생하는 표시이며 하나의 enum으로 세 축을 덮지 않습니다. PREPARED/EXECUTING은 사용자에게 노출하지 않고 04 문구를 사용합니다. 대기 중에도 §8.6으로 이탈 가능성을 계산합니다.

### 8.5 command 사건 순서

#### prepare 응답 유실

1. 같은 operation ID와 정확히 같은 prepare input을 tracker에서 읽습니다.
2. 같은 OP를 재전송해 ticket/current result를 복원합니다.
3. PREPARED이고 `executeIntent=true`이며 고정 payload가 exact read-back되면 같은 ticket으로 OP-007을 이어갑니다.
4. payload가 없거나 달라졌으면 실행하지 않습니다. 사용자가 IX-041의 종료 행동을 선택할 때만 OP-015를 호출합니다.

#### execute와 결과 확인

1. save/delete 선택부터 foreground 결과 조회 cycle은 최대 10초입니다. F11·F22 화면 잠금과 같지 않으며 §8.6 충족 시 cycle 중에도 이탈을 엽니다. 삭제 Dialog dismiss 잠금은 별도 계약입니다.
2. 각 transport deadline은 최대 8초이되 남은 cycle 시간이 더 짧으면 남은 시간으로 제한합니다.
3. terminal이 아니면 OP-008을 한 번에 하나만 실행합니다. 가능한 시점은 cycle 시작 직후, 약 1초·3초·7초입니다.
4. 10초에 terminal이 아니거나 조회가 끝나지 않으면 정적 결과 미확인 상태로 바꿉니다. 실패·미적용으로 바꾸지 않습니다.
5. `결과 다시 확인하기`는 새 10초 조회 cycle을 시작하지만 OP-007을 반복하지 않습니다.
6. 화면 unmount는 Coordinator의 진행 요청/cycle을 취소하지 않습니다. background는 timer를 멈추고 foreground/재진입은 같은 command single-flight로 한 번 확인합니다. ticket이 없으면 같은 operation ID·입력으로 준비 결과부터 복원합니다. 새 요청 생성·자동 무한 polling은 하지 않습니다.

#### 명시적 close

OP-015는 사용자의 `요청 종료` 또는 `과거 요청 정리`에만 호출합니다. timer, 화면 이탈, background scan은 호출하지 않습니다. EXECUTING이면 계속 결과 확인 상태를 유지하고, NOT_APPLIED 또는 인증된 reconciliation 뒤에만 target lock·tracker를 정리합니다. 다음 저장은 새 사용자 행동과 새 operation ID를 사용합니다.

### 8.6 안전 이탈과 본문 만료

F11·F22는 10초 경과나 결과 조회 단계와 무관하게 다음 확인을 모두 충족하면 `나중에 확인하기`와 화면 Back을 엽니다. 같은 target의 본문 변경·새 저장·질문 전환·수정 폐기·개별 삭제는 결과 해결까지 잠급니다(OD-21·D-TECH-044).

- 최신 draft 본문과 현재 editVersion의 exact read-back
- operation ID·generation·target·phase·executeIntent·고정 prepare input/fingerprint와 필요한 payload의 exact read-back
- ticket이 확인된 phase면 ticket meta의 exact read-back. 준비 응답 대기/유실에는 durable operation ID·동일 입력으로 ticket 복원이 가능해야 함

이탈은 취소·성공 판정이 아닙니다. 이동 직전 조건을 다시 검사하고 실패/미확인이면 이탈을 열지 않으며 원문·선택·복사·재보관·키보드 닫기를 유지합니다. 이탈 뒤 성공은 §8.7을 따릅니다.

payload는 마지막 사용자 수정 기준 7일 뒤 제거하고 PREPARED 자동 실행을 중단합니다. operation/ticket/fingerprint/generation/target/phase/timestamps·최소 정리 진척 같은 비본문 tracker만 유지합니다. 만료 뒤 본문 보관을 주장하지 않으며 04 IX-041의 명시적 정리/현재 상태 이동을 적용합니다. terminal 마무리·인증된 정리·전체 삭제 성공 뒤 tracker를 제거합니다.

### 8.7 늦은 결과와 중복 방지

terminal의 outcomeKey별 proof 확인·view 반영/재조회 예약·민감 record 제거·ack 진척을 분리합니다. effect는 반복해도 같은 결과가 되게 하고 영속 작업 성공 뒤 해당 표식을 기록합니다. 하나의 handled flag로 미완료 정리를 건너뛰지 않으며 필요한 정리·05의 결과 수명/ack 계약 뒤 tracker를 제거합니다.

view/cache는 재시작 때 사라지므로 과거 view 완료 표식으로 현재 동기화를 생략하지 않습니다. 알림/연출은 방문 자격과 별도 처리 표식으로 중복을 억제합니다. 햅틱과 Storage는 원자적이지 않으므로 crash 경계의 엄밀한 exactly-once를 주장하지 않습니다. 연출 소비 표식을 먼저 보관하고 재시작 복구는 재생하지 않는 at-most-once로 처리합니다. 소비 표식 확인이 안 되면 장식 연출/햅틱을 생략하고 확인된 완료 결과는 표시합니다. 표식 실패가 proof·정리·ack를 막지 않습니다.

- F11에 머물며 최초 성공을 확인한 경우만 F12/연출/햅틱을 실행합니다. 이미 이탈한 성공은 현재 화면에 한 번 알리고 cache만 동기화합니다.
- F22에 머문 수정 성공은 F21, 다른 화면에서는 현재 문맥만 동기화합니다.
- 이전 epoch 응답은 거절하고 현재 epoch에서 같은 tracker를 복구합니다. 이전 주체/generation 결과는 해당 삭제 recovery 외에는 폐기합니다.
- 각 마무리 단계 직후 종료·ack 실패·다중 observer·다른 기기의 변경을 별도로 재현합니다.

## 9. 세션, 닉네임과 삭제

### 9.1 승객 생성과 닉네임

OP-003은 일반 화면 mutation과 같은 선보관 원칙을 적용하지만 ticket lifecycle은 만들지 않습니다.

1. F02가 선택한 정책 ID/version과 operation ID를 고정·read-back합니다.
2. OP-003을 전송합니다. 응답이 유실되면 OP-001로 현재 session을 확인한 뒤 같은 생성 ID·입력을 재전송합니다.
3. ACTIVE 응답을 받으면 새 token·generation을 SessionController에 적용하고 F03으로 `replace`합니다.
4. 이미 ACTIVE인 복구 응답이라도 같은 생성 ID receipt일 때만 이 onboarding continuation을 완료합니다. 단순 ACTIVE 조회를 새 생성 성공처럼 연출하지 않습니다.
5. ACTIVE 인계와 generation manifest 초기화가 확인되면 PRE tracker와 local owner verifier를 제거합니다.

F03의 빈 입력과 승인된 실패 뒤 건너뛰기는 OP-004를 호출하지 않습니다. F30의 명시적 빈 값 저장만 `null` 해제로 보냅니다. 닉네임 mutation은 operation ID·정확한 입력·expected revision을 먼저 보관합니다. 응답 유실은 같은 입력으로 receipt를 복원하고, receipt revision이 현재 OP-002 profile보다 오래되면 과거 값으로 화면을 덮지 않습니다.

### 9.2 개별 삭제

1. F23이 표시한 answer ID와 expected revision, operation ID를 선보관합니다.
2. OP-012 ticket을 복원 가능하게 준비하고 ticket read-back 뒤 OP-007을 실행합니다.
3. terminal 전에는 F21 detail, F20 row, update draft를 지우지 않습니다.
4. 성공이면 detail cache와 해당 answer의 update draft를 제거하고 load된 F20 row·월 구획을 갱신합니다. OP-005 count와 관련 오늘/발췌를 재조회합니다.
5. NOT_APPLIED이면 F21의 기존 서버 본문을 유지하고 최신 OP-011 결과로 돌아갑니다.
6. local proof/cache/draft 정리가 확인된 뒤 OP-009를 시도합니다.

### 9.3 모든 데이터 삭제 준비

F31의 2차 확인 뒤 generation-wide lock을 먼저 잡습니다. 기존 EXECUTING command가 있거나 server가 `COMMAND_ALREADY_PENDING`을 반환하면 새 deletion 실행을 추측하지 않고 해당 command를 복구합니다. deletion prepare 성공부터 새 닉네임·답변 mutation과 이전 PREPARED 실행을 금지합니다. 삭제 실패/미확인에는 로컬 cache·draft·session을 먼저 지우지 않습니다.

### 9.4 모든 데이터 삭제 성공 순서

전체 삭제만 일반 mutation 마무리와 다른 다음 순서를 사용합니다.

```text
SUCCEEDED proof 확인
→ proof를 메모리의 deletion finalizer가 유지
→ 이전 generation Query/NavigationContext/공통 장면/UI state 폐기
→ SDK Storage의 이전 로컬 영역 제거 확인
→ 비민감 최소 deletion receipt 기록 확인
→ 제한 recovery token으로 OP-009 한 번 시도
→ 제한 token 폐기·route epoch 교체
→ F01 replace
```

- local root가 삭제된 generation이고 새 generation이 아직 없으면 `Storage.clearItems`로 앱 저장소 전체를 비웁니다. 이는 알려지지 않은 orphan record까지 제거하기 위한 전체 삭제 전용 경로입니다.
- 이전 generation manifest가 손상돼 표적 정리를 증명할 수 있고 현재/new generation이 없을 때도 `clearItems`를 사용합니다.
- 이미 다른/new generation이 로컬 root에 있으면 old receipt를 이유로 `clearItems`를 호출하지 않습니다. old generation의 알려진 manifest·record만 제거합니다.
- Storage 제거 자체가 실패하면 로컬 삭제를 완료했다고 표시하거나 재탑승을 열지 않습니다. 제한 recovery 상태에서 재시도합니다.
- 최소 deletion receipt 쓰기나 OP-009가 실패해도 서버 삭제 성공을 취소하지 않습니다. Storage 제거가 확인됐다면 제한 token을 폐기하고 F01로 이동하며, 다음 OP-001의 `recentDeletion`으로 다시 조정합니다.
- OP-009는 과거 일반 session이나 old manifest를 요구하지 않습니다. 메모리에 잠시 유지한 제한 token과 deletion ticket만 사용하므로 순환 의존이 없습니다.

`recentDeletion` 처리 시 receipt의 old generation과 로컬 current generation을 반드시 비교합니다. 같은/old generation만 제거하고, 새 탑승 generation·draft·cache·history를 지우지 않습니다.

## 10. 플랫폼 UI, 분석, 오류와 보호

### 10.1 Dialog·Sheet wrapper

Radix primitive는 `PixelDialog`, `PixelAlertDialog`, `PixelSheet` wrapper 내부에서만 사용합니다. wrapper가 다음을 공통 소유합니다.

- `aria-labelledby/aria-describedby`, modal 격리, focus trap과 trigger focus 복원
- Escape·Android Back·외부 영역 dismiss 허용 여부
- background scroll lock·복원과 Safe Area
- route open state와 Overlay open state의 단일화
- mutation 중 dismiss 잠금과 안전 행동 초기 focus

스타일은 §2.5에 따라 구현하고 토큰·외형은 02가 소유합니다. 외부 라이브러리의 Dialog를 중첩하지 않고 필요한 외형만 공통 Radix wrapper에 통합합니다. focus trap·portal·scroll lock·open state를 중복 소유하지 않습니다. Action/Cancel의 실제 의미 요소와 취소/실행 handler를 확인하고 Promise 완료나 실패만으로 자동 닫지 않습니다. 닫힘과 route 전환은 ARCA command 상태가 결정하며 외부 기본 error logger에 원문·payload를 전달하지 않습니다(D-TECH-052). 실제 iOS·Android WebView에서 focus, virtual keyboard, platform Back을 검증하기 전 완료로 표시하지 않습니다.

### 10.2 조건부 저장 바

첫 F11 slice부터 inline/bar를 build/config switch로 iOS·Android에서 비교합니다. 운영 기본값은 Acceptance #37 증거 전까지 inline이며 복구 완성까지 비교를 미루지 않습니다(D-TECH-047).

- 하나의 action state와 가능하면 같은 button DOM node의 배치만 변경합니다. 두 버튼의 교체 mount/복제로 포커스를 잃게 하지 않습니다. 다른 구현은 단일 조작·접근성 tree·selection 유지 증거가 필요합니다.
- SaveActionVisibilityController는 Visual Viewport 밖 여부·공간·hysteresis만 소유하며 입력·selection·scroll을 소유하지 않습니다.
- 바 높이/Safe Area 공간을 확보하고 작은 높이·200%·capability 불확실에는 inline으로 복귀합니다. 입력·커서·오류를 가리지 않습니다.
- mode 전환·저장 실패·결과 확인·안전 이탈에서도 같은 버튼의 포커스/action state를 검증합니다.

### 10.3 FE 제품 이벤트

`AnalyticsQueue`는 [05 §11 · L640–693](./05_API_SPEC.md#11-제품-이벤트-계약)의 FE 소유 이벤트만 받는 닫힌 API입니다. 임의 event name·properties 객체를 허용하지 않습니다.

- event ID는 발생 시 한 번 만들고 같은 앱 session의 재전송에서 재사용합니다.
- queue는 메모리 전용, 최대 100개입니다. 101번째부터 오래된 event를 UI와 무관하게 폐기하며 원문을 포함한 debug 기록을 남기지 않습니다.
- 최대 20개 batch로 OP-014를 best-effort 전송합니다. 20개 도달, 앱 lifecycle 전환, 네트워크 복귀를 flush hint로 쓰되 성공을 기다려 화면 이동을 막지 않습니다.
- 전송 실패는 현재 session 안에서만 bounded backoff 후 다시 시도합니다. reload에는 유실될 수 있습니다.
- generation 변경·전체 삭제 성공에는 queued/in-flight old generation event를 폐기합니다.
- `answer_saved`, `answer_edited`, `answer_deleted`, `onboarding_completed`, `all_data_deleted`는 BE 소유이므로 FE가 생성하지 않습니다.

### 10.4 민감 정보와 오류 보고

HTTP transport, Query devtools, analytics, console wrapper, Sentry에 다음 값을 넣지 않습니다.

- 응답·임시본·command payload·발췌·질문 원문/snapshot·닉네임
- 익명 키, access token, passenger code
- PRE tracker의 local owner verifier와 salt
- answer/question/SEMA/dailySema/ticket/operation ID와 cursor
- raw request/response body, Storage value, Clipboard text

허용되는 진단 값은 고정 operation 이름, HTTP status, 안정 error code/category, 앱 버전·플랫폼, 민감값 없는 local error kind와 사용자 표시용으로 승인된 request ID입니다. Sentry는 Replay를 끄고 before-send scrubber로 breadcrumbs, request data, component props를 allowlist합니다. 개발 build도 원문 console logging을 허용하지 않습니다.

local storage 오류, protocol 오류, transport 오류, domain 오류는 합치지 않습니다. 사용자는 04가 정한 문구를 보고, 내부 보고는 민감값 없는 분류만 사용합니다. 미저장 입력을 cache나 이벤트 때문에 저장된 정본처럼 표시하지 않습니다.

### 10.5 시각 자원 로딩과 실패 격리

픽셀 정체성은 02의 형태·서체 역할·아이콘과 정적 장면을 함께 적용합니다. 래스터 픽셀 에셋에는 `image-rendering: pixelated`와 승인된 정수 배율·기준 위치를 적용하고, 컨테이너는 reflow하되 에셋을 무조건 늘리지 않습니다. 픽셀 윤곽에는 임의의 소수 배율·blur·subpixel 이동을 피하고 작은 상태 이동도 02의 셀·모션 규칙을 따릅니다. 포커스 선은 clip/mask에 잘리지 않게 분리하며 확대·조작 가능성을 우선합니다. Reduced Motion·장식 로딩 실패에도 정적 픽셀 UI와 읽기 영역을 유지합니다(D-TECH-053).

첫 질문/작성에는 최소 셸·CSS·본문 시스템 서체·선별한 필수 아이콘을 우선 제공합니다. Neo둥근모는 self-host/fallback으로 실제 텍스트를 즉시 읽게 하고 폰트 완료를 F00 종료 조건으로 삼지 않습니다. preload는 첫 경로의 최소 파일부터 비교합니다.

인트로 후속 장면·기억 형성 sprite/motion·빈 상태 이미지는 해당 route 또는 유휴 시점에 지연 로딩합니다. 영역/대체 구도를 먼저 확보해 자원 도착이 입력·커서·버튼을 밀지 않게 합니다. 실패는 해당 장식의 정적 fallback으로 격리하고 성공 heading·원문·이동 행동을 기다리게 하지 않습니다. 뒤늦게 자원이 도착해 연출을 다시 시작하지 않습니다.

용량·권리·상태는 [Asset Manifest · L1–11](../../design/assets/ASSET_MANIFEST.md)를 소비합니다. 첫 slice부터 실제 기기의 cold start 질문 표시/입력 가능 시점·입력 지연·layout shift·경로별 전송량을 측정하고 조건·baseline·채택 예산을 08 증거로 고정합니다. 측정 전 수치를 완료 사실로 만들지 않습니다(D-TECH-049).

### 10.6 선별 입력·상태 컴포넌트 연결

- CMP-009~012는 실제 input/textarea/checkbox와 label·ref·composition/selection 이벤트를 보존합니다. 값은 기존 React state와 §7의 draft 경로가 소유하고 외부 내부 state나 form store에 정본을 복제하지 않습니다.
- 라이브러리의 UTF-16 `length` 카운터·native `maxLength`·자동 trim/절단·조합 중 검증을 그대로 사용하지 않습니다. ARCA의 실시간 EGC 카운터·IME 종료 후 검증·초과 원문 보존과 닉네임의 별도 규칙을 연결합니다. 저장 잠금·readonly·disabled는 04가 정한 상태에서만 적용하고 선택·복사 가능성을 검증합니다.
- 오류 발생 시 helper를 일괄 숨기는 기본값을 점검하고 기기 보관 실패·복구 위험의 필수 안내를 유지합니다. live region·Toast를 중복 발표하지 않으며 카운터가 매 키 입력을 읽게 하지 않습니다. 라이브러리 기본 문구는 04의 의미·조건·채택 문구로 연결합니다.
- autosize·최소 높이·native checkbox 시각 변경은 긴 입력, 320px·200%·키보드에서 검증합니다. 지원이 불확실한 자동 크기 CSS에는 실제 DOM을 유지하는 fallback을 두고 값/커서/포커스 복원과 단일 저장 조작을 보존합니다.
- 이 연결은 D-TECH-052의 구현 보완이며 입력 유효성·저장/삭제 결과·복구 정책을 새로 정의하지 않습니다.

## 11. 15개 화면 구현 책임 인벤토리

공통 session·query·draft·command 계약은 앞 절에서 한 번만 정의합니다. 아래 표는 화면이 직접 소유하는 상태와 공통 책임을 호출하는 시점만 기록합니다.

| 화면 | 서버 데이터·OP | 화면 local·입력/임시본 | 진입·이탈과 성공/실패 동기화 | 추적 |
|---|---|---|---|---|
| F00 | OP-001, ACTIVE 뒤 OP-005 | bootstrap phase와 안전 오류 분류만 | 앱 시작·F90 재시도. session/삭제 gate 뒤 route query·대상 복구 병행, 비대상 청소 후행; 실패 F90 | ON-02·06·08, IX-009·032·036, API-V-001~002·022, Acc #2·6·29 |
| F01 | 기능 OP 없음, OP-014 측정 | 장면 index, 원문 펼침, 건너뛰기 | PRE에서 진입, root Back 종료, 완료 F02. 이벤트 실패는 이동을 막지 않음 | ON-01, IX-020, Acc #1~2 |
| F02 | OP-001 정책, OP-003 | 두 checkbox·외부 문서 복귀 위치; draft 없음 | 생성 input 선보관, ACTIVE session을 F03에 인계. 응답 유실은 같은 ID 복원 | ON-02·03·07·08, IX-031~032, API-V-003·022, Acc #3·6 |
| F03 | OP-002/profile, 조건부 OP-004 | 닉네임 input·IME·편집 오류; draft 없음 | 빈 값은 무요청 F10. 성공 후 profile patch, 확정 실패 뒤 명시적 건너뛰기. 미확인 receipt 복원 | ON-04~06, IX-001~004·035, API-V-004·023, Acc #4·7 |
| F10 | OP-005, target tracker가 있으면 OP-008·009 우선 | 질문 선택·탐색 snapshot, 도움말·지난 draft Sheet, 공통 장면 완료 action | entry/foreground/KST 힌트 재조회. 미결 daily target은 F11 복구로 연결; 수정·삭제 뒤 today/발췌 갱신 | SE-01~09, AN-09, IX-015·027·029·033·036·038, API-V-005·024~026, Acc #9~11·33~34·39 |
| F11 | OP-006~009, 명시적 OP-015 | 선택 질문, exact input·IME·cursor, create draft, command 표시 | 질문 전환/Back/save 전 flush. terminal success 현재 화면이면 F12, NOT_APPLIED면 입력 유지, unknown은 안전 이탈 | SE-01·05~09, AN-01~05·09, IX-005~012·019·036~041, API-V-006~010·020·024·026, Acc #12~18·36~40·43 |
| F12 | OP-008·009, 필요 시 OP-005 | completion model, 연출 1회, 첫 조작 시 action hierarchy snapshot | core success 즉시 표시. 발췌·count 독립 갱신; 늦은 조회로 버튼 위계 변경 금지. Back/행동 F10·F20 | AN-06·08, IX-020~021·039, API-V-010·025, Acc #35 |
| F13 | 필수 OP 없음 | 선택 draft exact text, 실제 만료, copy 상태 | F10 Sheet·날짜 변경에서 진입. 만료면 원문 복원 금지; copy adapter 실패 시 직접 선택, 오늘 이동 F10 | SE-05, AN-02·05·09, IX-022·027~028·034·040~041, Acc #15·18·40 |
| F20 | OP-010 + 누적 수 OP-005, OP-014 측정 | page chain view·보류 후보, 월 구획, 더 보기/갱신 행동, scroll anchor | entry 첫 page refresh·IX-042 명시적 적용. count 실패와 목록 독립; row F21, empty F10. 수정/삭제는 load row만 반영 | AR-01·02·09, IX-023·027~029, API-V-010·012·016, Acc #21·33·38·41 |
| F21 | OP-011, 미결 answer tracker면 OP-008·009 우선 | 읽기 scroll, action focus | row/수정 복귀에서 진입. 다른 기기 변경은 최신 detail; 수정 F22, 삭제 F23, missing F20 | SE-09, AN-07·09, AR-03·09, IX-024·029·036·041, API-V-011·013·025, Acc #19·22~23·33·39 |
| F22 | OP-011·006~009, 명시적 OP-015 | exact input·IME·cursor, answer/baseRevision draft | detail 뒤 draft load. save 전 flush/선보관; 성공 F21, conflict 최신 상세, unknown 안전 이탈. F12 없음 | AN-01~04·07·09, AR-03·09, IX-005·007~009·016·019·024·036~041, API-V-006·009·011·020·026, Acc #19·36~40·43 |
| F23 | OP-011·012·007~009, 명시적 OP-015 | AlertDialog open/focus, delete command 상태 | F21 배경 modal. terminal 전 dismiss·선삭제 금지; 성공 F20, 실패 F21 유지, revision conflict 최신 상세 | AR-04·09, IX-025·029·041, API-V-008·013·020, Acc #22·39·43 |
| F30 | OP-002·004 | inline 닉네임 edit·IME·정책/지원 복귀 위치; draft 없음 | ACTIVE 진입. receipt 적용 뒤 OP-002 동기화; 취소는 local edit만 폐기. F31 진입 | ON-05·08, CS-01, DP-04, IX-003~004·018·031·035, API-V-004·023, Acc #4·7·31 |
| F31 | OP-013·007~009, 명시적 OP-015, 성공 뒤 OP-001 | 1차 화면·2차 AlertDialog·generation recovery gate | 성공 전 local 유지. 성공은 §9.4 순서 후 F01; unknown은 제한 session 복구; failure F31 유지 | AR-05~08, IX-026·029·036·041, API-V-014~015·021·027, Acc #24~25·32·39·44·47 |
| F90 | 원인별 OP-001·005 재시도 | 민감값 없는 오류 kind·support focus | F00 실패에서 진입. 재시도 F00 replace, 지원 후 복귀 상태 유지 | CS-01, DP-02, IX-009·031, API-V-002·017·019, Acc #29·31 |

## 12. 구현 순서

개발용 Mock 승객으로 질문→작성→저장→다시 읽기의 작은 실제 UI를 먼저 연결합니다. fixture 선택은 Mock adapter에 한정하고 운영 동의/탑승 guard를 우회해 배포하지 않습니다. 첫 slice 저장도 선보관·generation fence·terminal 판정을 적용하며 화면/횡단 기반 전체 선행을 요구하지 않습니다(D-TECH-038).

| 단계 | 선행 조건 | 포함 책임 | 완료 결과·함께 검증 |
|---:|---|---|---|
| 1. 인테이크 | 실제 저장소 | template/lockfile·SDK·하네스 명령·API 파생 도구·선별 UI peer/CSS/출처 확인 | 설치/미확인 구분, 07/08 해당 명령·증거부터 연결 |
| 2. 최소 경계 | 1 | ports·F00/F90·주체/session/generation gate·journal·routes | PRE/ACTIVE/오류 Mock, metadata 동시성/손상, 실제 Storage·익명 키·Back 최소 확인 |
| 3. 핵심 경험 | 2 | Mock ACTIVE F10→F11→F12→F20/F21 최소 목록/읽기·공통 장면·선별 CMP 통합·draft/command | exact 보관→확인된 저장→같은 문장 다시 읽기, maxWait·응답 유실·조기 이탈·마무리 중 종료 |
| 4. 탑승 연결 | 2~3 | F01~F03·OP-003/004·ACTIVE handoff | 동의·생성 유실·빈 닉네임·외부 복귀, 운영 Mock 진입 차단 |
| 5. 복구 확장 | 3 | OP-015·F13·session 갱신·자정·7일 만료 | PREPARED/EXECUTING·늦은 성공·정리 재개·긴 IME. [05 §16 · L807–819](./05_API_SPEC.md#16-저장-요청-분할-비교와-상태-전이-검증) 비교는 이후 별도 채택 |
| 6. 기록 관리 | 3·5 | F20 chain/갱신·F21~F23 | 0/20/21·월 경계·탐색 복원·수정/삭제·후보 무효화, F22 배치/이탈 검증 |
| 7. 설정/전체 삭제 | 4~6 | F30/F31·전체 fence·제한 session·정리 | commit 전 유지/뒤 old 영역 정리·A/B tombstone·큐 barrier·새 탑승 보호·ack 실패 |
| 8. 운영 통합 마감 | 3~7 누적 증거 | 계측 환경·Mock/실서버 동등성·법무/운영값·시각 채택 | 각 slice에서 확인한 개인정보/접근성의 최종 환경 연결과 남은 회귀, 출시 증거 분리 |

단계 3부터 공통 장면·탐색 복원·같은 DOM 저장 버튼 inline/bar·Safe Area·키보드·320px/200%·Reduced Motion·장식 지연/실패를 실기기에서 비교합니다. 선별 UI와 생성 배경은 [02 §1.4 · L50–57](./02_DESIGN_SYSTEM.md#14-서로-다른-출처의-시각-통합)·[03 §10 · L931–957](./03_SCREENS_SPEC.md#10-권장-시작안검증할-결과채택-상태)·Acceptance #53의 같은 화면/상태 조건으로 비교합니다. Overlay/clipboard/haptic은 처음 쓰는 slice에 검증을 붙입니다. 실제 기기/서버가 없으면 증거를 미완료로 남기고 독립 Mock 작업은 진행합니다.

07의 합성 시나리오/Clock과 08의 환경·명령·증거는 각 단계와 함께 작성합니다. 문서 전체 미작성을 이유로 검증을 마지막에 몰지 않습니다.

## 13. `07`·`08` 인계

### 13.1 `07_MOCK_SCENARIOS.md`

각 slice에 필요한 합성 시나리오는 [07 §11 · L179–307](./07_MOCK_SCENARIOS.md#11-이름-있는-시나리오-카탈로그), Clock·사건 순서는 [07 §5 · L93–109](./07_MOCK_SCENARIOS.md#5-가상-시간과-scheduler), Storage 장애는 [07 §7 · L130–150](./07_MOCK_SCENARIOS.md#7-storage와-앱-lifecycle)을 따릅니다. 조정 가능한 timing은 근거와 함께 이 문서에서 갱신하고 내부 함수·호출 순서를 합격 기준으로 고정하지 않습니다. 별도 Mock 요구 목록을 복제하지 않습니다.

### 13.2 `08_QA_AND_INTEGRATION.md`

검증 층은 [08 §3 · L50–76](./08_QA_AND_INTEGRATION.md#3-07-시나리오-실행-전략), 실제 환경·명령·증거는 [08 §11 · L196–209](./08_QA_AND_INTEGRATION.md#11-환경과-명령-계약)·[08 §12 · L211–223](./08_QA_AND_INTEGRATION.md#12-결과와-증거-기록)가 소유하며 각 slice와 함께 기록합니다. 구현 접합부에서는 다음을 확인합니다.

- 외부 Overlay의 자동 닫힘·중복 portal/발표·기본 error logging을 제거하고 F23 route·focus trap·복귀를 보존합니다.
- [§2.5 · L119–126](#25-공통-스타일과-의존성-경계)의 JS/CSS/폰트 전송량·중복 의존성·입력 반응, 선별 CMP·생성 배경의 조화와 소스 추적을 비교합니다(Acceptance #53).
- 첫 작성부터 저장 바의 같은 DOM·단일 focus, 탐색/갱신·보관·token 갱신·정리 재개·자원 실패를 연결합니다(Acceptance #37·48~52).
- service worker/HTTP cache의 `/v1/**` no-store와 generation 변경 뒤 late response 차단을 확인합니다.

실기기 입력·접근성은 [08 §7 · L126–138](./08_QA_AND_INTEGRATION.md#7-입력-접근성-플랫폼-검증), 민감정보·분석은 [08 §9 · L148–177](./08_QA_AND_INTEGRATION.md#9-개인정보-분석-보안과-artifact), 실제 운영 연결·출시는 [08 §13 · L225–265](./08_QA_AND_INTEGRATION.md#13-결함-flaky-예외와-gate)을 따릅니다.

## 14. 미확인 사실과 변경 gate

| 미확인 사실 | 확인 시점 | 불일치 시 처리 |
|---|---|---|
| 실제 프런트 저장소·template·package·lockfile | 단계 1 | 승인 방향과 다른 기존 코드가 있으면 영향 범위만 검토 중으로 전환 |
| 선별 UI export·React peer·CSS 빌드·WebView·라이선스·upstream 수정 비용 | 단계 1~3 및 해당 CMP 채택/갱신 | §2.4의 후보/도입 방식을 바꾸고 증거 기록. 호환성을 추측해 입력·Overlay 계약을 축소하지 않음 |
| SDK 3.x exact export·lifecycle·Storage 동작 | 단계 1~3부터 해당 slice | identity/storage 대체 구현을 추측하지 않고 adapter·해당 화면 차단 |
| OpenAPI→TypeScript/Zod 4 generator 호환 | 단계 1 | wire를 수작업 복제하지 않고 후보를 교체; API 의미 변경은 05 승인 필요 |
| Web Crypto와 `Intl.Segmenter` 실제 WebView 지원 | 단계 2~4부터 해당 slice | PRE owner verifier가 없으면 키 원문 저장/자동 재전송으로 우회하지 않음. EGC는 호환 fallback을 고정하고 동일 corpus 검증 |
| token TTL·실제 clock skew | 실서버 통합 | proactive margin만 조정. 서버 recovery 계약은 변경하지 않음 |
| API base URL·CORS·network policy | 실서버 통합 | 환경 adapter만 갱신; 화면별 URL 추가 금지 |
| Storage quota·강제 종료 지속성·clear 범위 | 단계 2·3·5·7 | 보관 성공 표현과 출시 gate 조정; 원자성을 새로 가정하지 않음 |
| 외부 문서/고객센터 open·복귀 capability | 단계 4 및 사용하는 slice | platform adapter와 복귀 focus만 조정 |
| 실제 분석/Sentry 환경·retention | 단계 8 | 개인정보 조건 충족 전 운영 활성화 금지 |

새 사실이 제품 결과·복구 가능성·API 의미를 바꾸면 이 문서 안에서 조용히 우회하지 않습니다. 담당 SSOT와 새 결정 ID를 먼저 승인합니다. 패키지명·파일 배치·동일 의미 타입처럼 제품 결과를 바꾸지 않는 사항은 구현 PR에서 근거와 함께 고정할 수 있습니다.
