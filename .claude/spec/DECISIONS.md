# ARCA 프런트엔드 개발 결정 지도

- 문서 버전: v2.6
- 최근 수정일: 2026년 9월 21일
- 상태: 확정
- 승인 주체: 제품 책임자

이 문서는 현행 개발 선택의 이유와 담당 명세를 연결합니다. 구현 계약·수치·문구는 각 행의 담당 명세가 소유하며, 이 표를 별도 계약 원본으로 사용하지 않습니다. 제품 정책은 [Open Decisions](../../docs/ARCA_OPEN_DECISIONS.md)와 담당 제품 SSOT를 참조합니다.

각 ID는 현재 적용할 범위로 정리했습니다. 전체 대체된 ID는 §12의 안내만 유지하며 재사용하지 않습니다. 결정 강도·변경 절차는 [00 §7~8](./00_INDEX.md), 문서 작성 상태는 [00 §1](./00_INDEX.md), 실제 구현·검증 조건은 담당 명세를 따릅니다.

## 1. 문서 운영 결정

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-001 | 책임별 명세가 계약을 한 번만 소유하고 소비 문서가 직접 참조합니다. 중복 정의의 불일치를 줄입니다. | [00 §2~3](./00_INDEX.md) |
| D-TECH-002 | 제품 SSOT→확정 담당 명세→Mock·테스트→코드 순으로 판단합니다. 결정 요약의 충돌은 담당 명세에서 정정합니다. | [00 §4](./00_INDEX.md) |
| D-TECH-003 | 모순은 영향 범위만 차단합니다. 개인정보·유실·인증·날짜·멱등성·전체 삭제 문제는 공통 기반까지 확인합니다. | [00 §5](./00_INDEX.md) |
| D-TECH-004 | OP·CMP·IX·CPY·개발 결정은 유형별 안정 ID, 토큰은 의미 기반 이름을 사용합니다. 위치나 대화 번호에 결합하지 않습니다. | [00 §6](./00_INDEX.md) |
| D-TECH-005 | 초안·검토 중·확정·차단·폐기를 구분하고 제품 책임자가 확정합니다. 표현 탐색은 결정 강도별 허용 범위를 따릅니다. | [00 §7](./00_INDEX.md) |
| D-TECH-006 | 현행 결정·이유·담당 명세와 이전 ID의 대체 안내만 유지합니다. 상세 계약과 과거 대화·반영 로그를 중복 보관하지 않습니다. | [00 §8](./00_INDEX.md) |

## 2. UI Overview 결정

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-UI-001 | 고요한 심우주 관측실과 정적→집중→온기→짧은 빛→축적의 감정 곡선을 사용합니다. 게임성보다 성찰·읽기 경험을 우선합니다. | [01 §3](./01_UI_OVERVIEW.md) |
| D-UI-002 | 320px 최소 폭·480px 콘텐츠 폭, 기본 20px/작은 화면 16px 여백을 사용합니다. 세로 흐름과 큰 글자 reflow를 보장합니다. | [01 §6](./01_UI_OVERVIEW.md) |
| D-UI-003 | Safe Area·키보드·Back을 공통 앱 셸과 하나의 라우트 계층에서 처리해 화면 간 불일치를 줄입니다. | [01 §6~7](./01_UI_OVERVIEW.md) |
| D-UI-004 | 탭·설정 진입은 루트 F10·F20에만 두고 다른 화면은 명시적 뒤로가기를 제공합니다. | [01 §5](./01_UI_OVERVIEW.md) |
| D-UI-006 | 실제 KST 날짜·SEMA 코드를 사용하고 세계관 날짜는 표시하지 않습니다. 실제 날짜와 자정 안내의 혼동을 막습니다. | [01 §8](./01_UI_OVERVIEW.md) |
| D-UI-007 | 에셋 상태·권리를 매니페스트에서 관리하고 사용 승인된 파일만 운영에 포함합니다. MVP 사운드는 사용하지 않습니다. | [01 §10](./01_UI_OVERVIEW.md) |
| D-UI-008 | 행동·계약은 번호 명세가 소유합니다. 시각 탐색에는 Figma·코드를 허용하며 채택본마다 기준 원본 하나를 지정합니다. | [01 §10](./01_UI_OVERVIEW.md) |

## 3. Design System 결정

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-UI-009 | 앱 소유 UI는 ARCA 픽셀 시스템, 필수 Navigation·플로팅 탭 형식은 플랫폼 경계로 구분합니다. 역할별 서체·장식·외부 UI 통합을 허용합니다. | [02 §1](./02_DESIGN_SYSTEM.md) |
| D-UI-010 | 경험 색과 기능 상태 색을 분리합니다. record/document 문맥과 기억 표현의 상세는 현행 토큰·도메인 계약을 따릅니다. | [02 §3·8.3](./02_DESIGN_SYSTEM.md) |
| D-UI-011 | 픽셀 서체는 self-host Neo둥근모 v1.601 Regular WOFF2, 장문·사용자 응답은 시스템 본문 서체입니다. 합성 굵기·기울임 없이 fallback·글자 확대를 보장합니다. | [02 §4](./02_DESIGN_SYSTEM.md) |
| D-UI-012 | 4px 셀과 간격 단계를 사용하고 장식 강도를 역할별로 구분합니다. 모든 surface에 외곽선·계단형을 강제하지 않습니다. | [02 §5~6](./02_DESIGN_SYSTEM.md) |
| D-UI-013 | 대비·44px 조작 타깃·포커스·200% 확대·320px reflow를 공통 최소선으로 적용합니다. 상태를 색만으로 전달하지 않습니다. | [02 §12](./02_DESIGN_SYSTEM.md) |
| D-UI-014 | 주 행동의 픽셀 형태·pressed 피드백과 화면당 Primary 최대 하나를 유지합니다. 게임 입력처럼 과장된 발광은 사용하지 않습니다. | [02 §9.3](./02_DESIGN_SYSTEM.md) |
| D-UI-016 | AlertDialog·Sheet·Toast·InlineStatus를 의미별로 구분합니다. 확인·복구와 가벼운 피드백에 맞는 차단·포커스 수준을 적용합니다. | [02 §9.7](./02_DESIGN_SYSTEM.md) |
| D-UI-017 | 플랫폼 Navigation 아래 앱 셸을 시작하고 공통 헤더를 중복 배치하지 않습니다. 제목은 콘텐츠 내부에 두어 작은 화면 공간을 보존합니다. | [02 §1.2·9](./02_DESIGN_SYSTEM.md) |
| D-UI-018 | Canvas·Scene·Record·Inset surface를 의미별로 사용합니다. 밝기·장식은 역할에 맞추고 CMP의 의미를 유지합니다. | [02 §9.2](./02_DESIGN_SYSTEM.md) |
| D-UI-020 | 기본·대체 질문은 명시적인 보조 행동으로 전환합니다. 스와이프·캐러셀·무한 재추첨을 사용하지 않습니다. | [02 §9.6](./02_DESIGN_SYSTEM.md) |
| D-UI-021 | Pixelarticons를 기본 후보로 외부·자체 아이콘을 선별합니다. 같은 의미·표시 밀도·접근성·권리를 유지하고 도메인 시각은 ARCA 방향으로 제작합니다. | [02 §8.2](./02_DESIGN_SYSTEM.md) |
| D-UI-022 | 기능 상태는 밝은/어두운 문맥별 전경·배경 토큰을 사용합니다. 경험 색과 섞지 않고 실제 대비를 검증합니다. | [02 §3.2~3.3](./02_DESIGN_SYSTEM.md) |
| D-UI-023 | 정적 Placeholder와 행동 위치의 인라인 상태를 사용합니다. 저장 버튼 크기·기존 목록을 보존하고 단일 live region으로 알립니다. | [02 §11](./02_DESIGN_SYSTEM.md) |
| D-UI-024 | 모션 토큰·무한 반복 금지·Reduced Motion 대체를 적용합니다. 조작 반응과 장식 연출을 구분합니다. | [02 §7.1~7.2](./02_DESIGN_SYSTEM.md) |
| D-UI-026 | 레이어·Dimmer·Overlay/Toast 중첩 규칙을 공통으로 관리합니다. 플랫폼 UI는 앱 내부 z-index 계산과 분리합니다. | [02 §6.3](./02_DESIGN_SYSTEM.md) |
| D-UI-027 | 영구 Label·도움말·보관 상태·카운터·오류를 갖는 Field를 사용합니다. 입력 높이는 내용·키보드에 맞춰 확장하고 read-only·disabled를 구분합니다. | [02 §9.4](./02_DESIGN_SYSTEM.md) |
| D-UI-028 | 두 독립 네이티브 checkbox와 별도의 전문 열람을 제공합니다. 두 약관 모두 동의 전 주 행동을 비활성화하고 전체 동의는 두지 않습니다. | [02 §9.5](./02_DESIGN_SYSTEM.md) |
| D-UI-029 | JOY·SEMA·응답·기억·누적 수·항해 기록을 구분하되 평가·희귀도·획득 보상으로 표현하지 않습니다. 시각 형상은 현행 도메인 기준을 따릅니다. | [02 §8.3](./02_DESIGN_SYSTEM.md) |
| D-UI-030 | 최초 서버 저장 성공 뒤 최대 2초 연출·건너뛰기·완료 정지화면과 1회 best-effort 햅틱을 제공합니다. 픽셀 개수·안무는 고정하지 않습니다. | [02 §7.3](./02_DESIGN_SYSTEM.md) |
| D-UI-031 | 장식·아이콘 행동의 접근성 의미, 라우트·Overlay 포커스, 안전한 삭제 초기 포커스와 상태 발표를 공통 계약으로 적용합니다. | [02 §12](./02_DESIGN_SYSTEM.md) |

## 4. 기술 스택 결정

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-008 | 생성 시점의 SDK 3.x 이상 최신 안정 버전·템플릿 의존성을 정확히 고정하고 월 1회 검증 후 업데이트합니다. 설치 버전과 과거 조사값을 구분합니다. | [06 §2.2](./06_FRONTEND_SPEC.md) |
| D-TECH-009 | Node 24 LTS와 버전을 고정한 pnpm·pnpm-lock.yaml을 사용해 로컬·CI 환경을 재현합니다. | [06 §2.2](./06_FRONTEND_SPEC.md) |
| D-TECH-010 | React Router로 URL·history·딥링크를 관리합니다. 자체 라우터의 복귀·진입 오류를 줄입니다. | [06 §5](./06_FRONTEND_SPEC.md) |
| D-TECH-012 | TanStack Query v5가 서버 상태를 소유하고 cache는 메모리에만 둡니다. mutation은 계약에 없는 자동 재시도를 하지 않습니다. | [06 §6](./06_FRONTEND_SPEC.md) |
| D-TECH-013 | UI는 React 내장 상태·도메인 hook, 영속 임시본은 SDK Storage를 사용합니다. 전역 store·범용 form 정본을 추가하지 않습니다. | [06 §4·7](./06_FRONTEND_SPEC.md) |
| D-TECH-014 | native fetch·Zod 4·ArcaApi로 경계를 검증합니다. wire 타입·validator는 OpenAPI에서 파생하며 Storage 모델은 별도로 검증합니다. | [06 §3.3~3.4](./06_FRONTEND_SPEC.md) |
| D-TECH-015 | AIT Devtools로 플랫폼, 인메모리 adapter로 도메인, MSW 2로 채택 HTTP 계약을 검증합니다. 도메인과 전송 실패를 각각 재현합니다. | [06 §2.2·13](./06_FRONTEND_SPEC.md) |
| D-TECH-016 | Vitest 5·RTL·user-event·axe-core·Playwright Chromium/WebKit·iOS/Android QR로 검증합니다. 설치 버전·호환성은 저장소에서 고정합니다. | [06 §2.2·13.2](./06_FRONTEND_SPEC.md) |
| D-TECH-017 | Intl.DateTimeFormat과 주입 Clock을 사용하고 날짜 전용 값은 검증된 문자열로 유지합니다. 저장 날짜는 ARCA 서버가 판정합니다. | [06 §2.2·13.1](./06_FRONTEND_SPEC.md) |
| D-TECH-018 | CSS·Web Animations API로 모션을 만들고 Reduced Motion 대체와 건너뛰기를 제공합니다. 제한된 연출에 맞는 도구를 사용합니다. | [02 §7](./02_DESIGN_SYSTEM.md) |
| D-TECH-019 | TypeScript strict·noUncheckedIndexedAccess·exactOptionalPropertyTypes, tsc --noEmit과 Biome 2로 정적 검사를 수행합니다. | [06 §2.2·13.2](./06_FRONTEND_SPEC.md) |
| D-TECH-020 | 자체 분석 API와 PII·Replay를 끈 최소 Sentry를 사용합니다. 익명 키 자동 수집과 중복 분석을 피합니다. | [06 §10.3~10.4](./06_FRONTEND_SPEC.md) |
| D-TECH-021 | GitHub Actions에서 정적 검사·테스트·빌드·브라우저 스모크를 수행하고 .ait·source map 업로드는 보호된 수동 workflow로 분리합니다. | [06 §13.2](./06_FRONTEND_SPEC.md) |
| D-TECH-022 | 공식 create-ait-app의 일반 react-ts 프리셋을 사용합니다. TDS 전용 프리셋을 생성했다가 제거하는 작업을 줄입니다. | [06 §2.2](./06_FRONTEND_SPEC.md) |
| D-TECH-023 | 네이티브 의미·ARCA 토큰과 headless 접근성 경계를 유지합니다. UI 선별·Tailwind 허용·Emotion 선택 사용은 D-TECH-050~052를 따릅니다. | [06 §2.4~2.5·10.1](./06_FRONTEND_SPEC.md) |

## 5. 설치 버전 적용

정확한 package·SDK·peer dependency·lockfile은 [06 §2.2](./06_FRONTEND_SPEC.md)에서 고정합니다. 플랫폼 출시 제약은 [플랫폼 기준 §3](../../spec/platform/ARCA_APPS_IN_TOSS_FEATURES.md#3-출시-전-플랫폼-확인), 에셋 파일·권리는 [Asset Manifest](../../design/assets/ASSET_MANIFEST.md)를 따릅니다.

## 6. 시각 표현과 탐색

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-024 | 필수 계약·조정 기본값·탐색 표현을 구분합니다. 가역적 프로토타입은 자율 비교하고 채택 시 담당 명세·근거를 맞춥니다. | [00 §7.1](./00_INDEX.md) |
| D-TECH-025 | F10→F11→F12 비교와 실기기 증거로 핵심 표현을 채택합니다. Figma·코드를 모두 허용하되 채택본마다 기준 원본 하나를 지정합니다. | [01 §10](./01_UI_OVERVIEW.md) |
| D-UI-032 | JOY·브랜드·조작은 픽셀 서체, 사용자 응답·장문은 시스템 본문 서체로 구분합니다. 타입 수치는 실기기 읽기 품질에 따라 조정합니다. | [02 §4](./02_DESIGN_SYSTEM.md) |
| D-UI-033 | 질문·작성·저장을 낮은 명도로 연결하고 기록 입력은 잉크색 record를 기본으로 둡니다. 문서는 밝은 document 문맥을 선택할 수 있습니다. | [02 §3·9.2](./02_DESIGN_SYSTEM.md) |
| D-UI-034 | 주요 행동·도메인 서명에 픽셀 장식을 집중하고 읽기·보조 면에는 여백·무테를 허용합니다. 조작·포커스 식별성은 유지합니다. | [02 §6·9.2](./02_DESIGN_SYSTEM.md) |
| D-UI-035 | 미응답·작성의 첫 읽기 대상은 질문입니다. 완료 홈은 자기 응답 발췌 중심으로 구분합니다. | [03 §5.1~5.2](./03_SCREENS_SPEC.md) |
| D-UI-036 | Textarea는 작은 3~4줄 시작안에서 내용·실제 키보드 공간에 맞춰 확장합니다. 고정 높이 이후 내부 스크롤을 기본으로 강제하지 않습니다. | [02 §9.4](./02_DESIGN_SYSTEM.md) |
| D-UI-037 | JOY의 기계 얼굴·관측등 같은 시각적 인격을 허용합니다. 반응은 실제 신호·저장 사건에 한정하고 감정 추정·친밀도·대화를 추가하지 않습니다. | [02 §8.3](./02_DESIGN_SYSTEM.md) |
| D-UI-038 | 작성 공간의 빛이 기록편으로 이어지는 안을 비교합니다. 보존의 연결감으로 판단하고 시간·건너뛰기·Reduced Motion·햅틱 계약을 유지합니다. | [03 §5.3·10](./03_SCREENS_SPEC.md) |
| D-UI-039 | 자기 응답 발췌를 중심으로 질문·날짜를 보조 배치하는 한 열 기록 목록을 사용합니다. 구분선의 형태보다 읽기 문맥을 우선합니다. | [03 §6.1](./03_SCREENS_SPEC.md) |
| D-UI-040 | 정수 배율과 배경/전경 분리, 장면별 기준 위치·허용 crop을 사용합니다. 실제 컨테이너에서 의미·가독성과 전체 에셋 예산을 검증합니다. | [02 §8.1](./02_DESIGN_SYSTEM.md) |

## 7. 화면 구조

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-UI-042 | F02는 핵심 설명·복구 제한·필수 약관·탑승 행동을 문서 흐름에 둡니다. 필수 정보·전이를 지키는 배치 대안은 비교할 수 있습니다. | [03 §4.3](./03_SCREENS_SPEC.md) |
| D-UI-045 | F11에서 질문을 직접 전환하고 질문별 임시본을 복원합니다. 질문 전환을 위해 F10으로 왕복하지 않습니다. | [03 §5.2](./03_SCREENS_SPEC.md) |
| D-UI-046 | F11·F22는 페이지의 단일 흐름과 비고정 질문을 기본으로 둡니다. 저장 버튼은 inline을 시작안으로 조건부 bar와 비교합니다. | [03 §5.2·6.3·10](./03_SCREENS_SPEC.md) |
| D-UI-048 | 유효한 지난 임시본만 보조 진입·선택을 제공하고 F13에서 읽기·복사합니다. 오늘 답변으로 자동 전용하지 않습니다. | [03 §5.1·5.4](./03_SCREENS_SPEC.md) |
| D-UI-049 | F20은 응답 발췌→질문 일부→실제 날짜의 한 열 행과 누적 수를 제공합니다. 월 구획과 페이지 경계의 일관성을 유지합니다. | [03 §6.1](./03_SCREENS_SPEC.md) |
| D-UI-051 | F30은 승객·복구 제한·정책/고객센터·버전·위험 영역을 구분합니다. 설명과 행동의 문맥을 함께 제공합니다. | [03 §7.1](./03_SCREENS_SPEC.md) |
| D-UI-052 | 닉네임은 읽기 행에서 편집을 선택하면 같은 그룹의 입력·저장·취소로 펼칩니다. 설정의 기본 정보 밀도를 낮춥니다. | [03 §7.1](./03_SCREENS_SPEC.md) |
| D-UI-053 | 약관은 독립 문서 문맥에서 열고 복귀 시 scroll·선택·편집 상태와 실행 요소 포커스를 복원합니다. | [03 §4.3·7.1](./03_SCREENS_SPEC.md) |
| D-UI-054 | F31 전용 화면의 삭제 범위·비가역성·보존 예외 설명 뒤 AlertDialog로 최종 재확인합니다. 긴 설명과 최종 조작을 분리합니다. | [03 §7.2](./03_SCREENS_SPEC.md) |

## 8. 핵심 경험과 화면별 위계

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-UI-055 | 참여 이유→JOY와 기억→탑승의 3장면을 시작안으로 비교합니다. 원문 펼침과 F02 직접 건너뛰기, 동의 화면의 핵심 설명을 유지합니다. | [03 §4.2~4.3·10](./03_SCREENS_SPEC.md) |
| D-UI-056 | F03은 빈 닉네임 건너뛰기·유효값 저장 후 한 번에 F10으로 이동합니다. 실패 뒤 명시적 진행은 D-UI-078을 따릅니다. | [03 §4.4](./03_SCREENS_SPEC.md) |
| D-UI-057 | F10 미응답은 질문 가까이에 작성·전환 행동을 둡니다. 긴 질문·큰 글자에서도 행동과 필수 정보를 찾는 결과로 배치를 비교합니다. | [03 §5.1·10](./03_SCREENS_SPEC.md) |
| D-UI-058 | 질문 읽기→입력→기록편과 실제 저장 문장이 공간적으로 이어지는 안을 비교합니다. route·focus·키보드·Reduced Motion·원문 보호를 유지합니다. | [03 §5·10](./03_SCREENS_SPEC.md) |
| D-UI-059 | 긴 글 중간 편집의 저장 도달성과 가림 방지를 함께 검증합니다. inline/조건부 bar 전환에도 단일 control·focus를 유지합니다. | [04 §5.8](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-060 | 비공개·기기 보관·서버 저장을 구분합니다. 입력 가까이 실제 보관 상태를 표시하며 반복 설명은 도움말로 분리합니다. | [04 §5.1·5.15~5.16](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-061 | 최초 조작 가능 시 첫 기억은 기록 우선, 반복·수 미확인은 오늘 우선으로 고정합니다. 두 이동 행동은 항상 유지합니다. | [04 §5.17](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-062 | F10 완료는 저장 응답 발췌·기록편·완료 결과가 중심입니다. 질문·메타는 저장 당시 문맥으로 보조 제공합니다. | [03 §5.1](./03_SCREENS_SPEC.md) |
| D-UI-063 | F13은 날짜 변경 직후 복사 우선, 재열람은 오늘 이동 우선입니다. 확인된 기기 보관에만 실제 만료 일시를 표시합니다. | [03 §5.4](./03_SCREENS_SPEC.md) |
| D-UI-064 | F20의 KST 연월 구획은 실제 기록 날짜로 만들고 페이지 중복 제목·미작성 기간 빈칸을 만들지 않습니다. | [04 §5.10](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-065 | F21은 저장 당시 질문 전문을 서문으로 제공하고 응답 전문을 주 읽기 영역으로 둡니다. 질문을 접거나 생략하지 않습니다. | [03 §6.2](./03_SCREENS_SPEC.md) |
| D-UI-066 | F21은 강조 Primary 없이 읽기로 완결합니다. 수정·삭제는 명확한 보조 행동으로 유지합니다. | [03 §6.2](./03_SCREENS_SPEC.md) |
| D-TECH-026 | 정보 묶음·배치를 권장 시작안과 검증할 결과로 구분합니다. 필수 정보·전이·보호·접근성을 유지하는 대안을 자율 비교합니다. | [03 §1.3·10](./03_SCREENS_SPEC.md) |

## 9. 입력·상호작용·문구

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-UI-067 | Unicode 확장 grapheme·IME 종료 후 검증을 사용합니다. 초과 입력을 자르지 않고 응답 공백·줄바꿈 원문을 보존합니다. | [04 §4](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-068 | 질문 전환은 현재 임시본 쓰기 성공 뒤 실행합니다. 최신 보관 여부에 따라 이탈을 보호하고 전환 조작 포커스를 유지합니다. | [04 §5.1~5.3·5.7](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-069 | 저장 원문·중복 실행 잠금을 유지하고 미확인은 재저장 대신 조회합니다. 키보드 닫기·안전 이탈은 분리하며 오프라인 복구 후 자동 저장하지 않습니다. | [04 §5.4·5.7·5.14](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-070 | 단일 피드백 우선순위와 Overlay별 닫힘 규칙을 적용합니다. 높은 오류에도 미보관 위험·복사 필요성을 함께 제공합니다. | [04 §5.5~5.7·5.15](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-071 | 연출 건너뛰기는 한 번만 종료하고 완료 결과에 focus를 둡니다. 보조 조회는 저장 성공과 분리하며 버튼 위계는 최초 조작 가능 시 고정합니다. | [04 §5.9·5.17](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-072 | 발췌는 서버 prefix·생략 정보와 화면 overflow를 결합합니다. 프로필·예산은 현행 IX-027을 따르고 목록은 명시적으로 더 불러옵니다. | [04 §5.9~5.10](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-073 | 저장 불가·미확인에서 원문 복사를 제공합니다. 실패 시 화면·접근성의 직접 선택 안내와 포커스를 보장합니다. | [04 §5.18](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-074 | 수정 임시본과 별도 폐기 확인, 닉네임 취소 즉시 폐기, 삭제 범위·비가역성·보존 고지를 구분합니다. | [04 §5.9](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-075 | 일반 작성 행동과 기억 조각 저장 결과를 구분합니다. 정확한 문자열은 CPY, JOY의 표현은 비평가·비진단 원칙을 따릅니다. | [04 §7](./04_INTERACTIONS_AND_COPY.md) |
| D-TECH-027 | IX와 CPY를 안정 계약 ID로 사용합니다. 화면은 해당 ID를 참조하고 상세를 복제하지 않습니다. | [04 §2](./04_INTERACTIONS_AND_COPY.md) |

### 9.1 설명·복구·완료 표현

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-UI-076 | 화면·입력·행동으로 이미 전달하는 중복 설명을 줄입니다. 원인·유실 위험·복구 행동 등 사용자 판단을 바꾸는 정보는 유지합니다. | [04 §7.0](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-077 | 첫 진입의 핵심 설명과 반복 작성의 짧은 상태·도움말을 구분합니다. 비공개·수동 저장·발췌·복구 제한은 유지합니다. | [04 §5.16·7](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-078 | 선택형 닉네임 실패 뒤 명시적 건너뛰기를 제공합니다. 입력을 지워야만 진행할 수 있는 우회를 요구하지 않습니다. | [04 §5.13](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-079 | 유한 대기·요청 추적·원문 보관·재진입 조회로 무기한 잠금과 중복 저장을 피합니다. 대기 중 안전 이탈은 D-TECH-044를 따릅니다. | [04 §5.14](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-080 | 복합 오류에 기기 미보관 위험을 결합하고 복사 실패의 직접 선택 방법을 제공합니다. 보관 실패 때 만료 영역은 숨깁니다. | [04 §5.15·5.18](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-081 | F12 성공 heading은 발췌·수 조회와 독립적으로 유지합니다. 최초 조작 가능 시 버튼 위계를 고정해 누르려는 행동이 바뀌지 않게 합니다. | [04 §5.17](./04_INTERACTIONS_AND_COPY.md) |
| D-UI-082 | F31 삭제 대상·증빙 항목은 목록으로 구분합니다. 1년·최대 30일·백업 복구 미사용·비가역성의 의미를 유지합니다. | [04 §6.14·7.10](./04_INTERACTIONS_AND_COPY.md) |
| D-TECH-028 | 문구의 필수 의미·표시 조건·현재 채택 문자열을 구분합니다. 의미를 지키는 축약·어미 조정은 자율 채택하고 문자열·검증을 동기화합니다. | [04 §7.0](./04_INTERACTIONS_AND_COPY.md) |
| D-TECH-029 | 동적 값에는 단위를 넣지 않고 문구에서 한 번만 붙입니다. 숫자 포맷과 미확인 처리를 구분해 중복 단위·오해를 막습니다. | [04 §5.10·7.0](./04_INTERACTIONS_AND_COPY.md) |

## 10. API 계약 결정

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-API-001 | 서버가 앱인토스 익명 키를 검증한 뒤 PRE_PASSENGER·ACTIVE·DELETION_RECOVERY opaque 세션을 발급합니다. 원본 키의 반복 전송을 줄입니다. | [05 §6.1](./05_API_SPEC.md) |
| D-API-002 | prepare→execute→result를 현재 기본 계약으로 사용합니다. 실행 전/중 상태와 종료 경쟁은 D-API-031, 단일 수락 비교는 D-API-028을 따릅니다. | [05 §6.4·6.7·16](./05_API_SPEC.md) |
| D-API-003 | 신규 저장의 날짜·질문 문맥은 최초 영속 수락 시 고정합니다. 같은 dailySemaId의 교체 콘텐츠와 실행 기한을 구분합니다. | [05 §2.3·6.4](./05_API_SPEC.md) |
| D-API-004 | 수정·삭제에 revision, 모든 ticket·전체 삭제에 generation fence를 적용해 오래된 변경·삭제 후 부활을 막습니다. | [05 §9](./05_API_SPEC.md) |
| D-API-005 | 삭제 결과는 인증된 command로 확인하고 삭제 후에는 제한된 복구·ack 권한을 사용합니다. 정상 데이터 접근을 계속 허용하지 않습니다. | [05 §6.1·6.7](./05_API_SPEC.md) |
| D-API-006 | 세션이 필수 정책 ID·version·URL을 제공하고 OP-003은 consent·passenger를 원자 생성하며 ACTIVE 세션을 반환합니다. | [05 §6.1~6.2](./05_API_SPEC.md) |
| D-API-007 | 저장 성공 proof와 표시용 발췌·활성 수를 분리합니다. revision·관찰 시각·availability를 지켜 과거 결과와 현재 데이터를 혼합하지 않습니다. | [05 §5.5](./05_API_SPEC.md) |
| D-API-009 | 20개 bounded keyset cursor와 createdAt/answerId 내림차순을 사용합니다. page chain의 신규 삽입·중복·누락을 통제합니다. | [05 §6.8](./05_API_SPEC.md) |
| D-API-010 | 전체 삭제는 활성 데이터·연결 가능한 raw 분석을 제거합니다. 동의 증빙 1년·backup 최대 30일의 예외와 ACID 경계는 담당 규칙을 따릅니다. | [05 §10.3](./05_API_SPEC.md) |
| D-API-011 | 만료 시각이 있는 access token을 사용하고 서버가 지정한 recovery에서만 키 재검증 후 동일 요청을 최대 1회 재시도합니다. | [05 §6.1·8](./05_API_SPEC.md) |
| D-API-012 | 안정 오류 code·category·request ID와 결과 확실성을 분리합니다. 서버 자유 문구를 UI에 사용하지 않고 wire allowlist를 검증합니다. | [05 §8](./05_API_SPEC.md) |
| D-API-013 | 답변 write·삭제는 ticket, 승객 생성은 idempotency key, 닉네임은 operation ID·revision·receipt로 복구합니다. 모든 mutation을 같은 절차로 강제하지 않습니다. | [05 §6.2~6.7](./05_API_SPEC.md) |
| D-API-014 | BE는 성공 outcome, FE는 UI 노출·행동 이벤트를 생성하고 event ID로 중복 제거합니다. FE가 서버 성공을 추정하지 않습니다. | [05 §11](./05_API_SPEC.md) |
| D-API-015 | OP-005는 날짜·SEMA 두 질문·오늘 답변·활성 수의 read model을 반환합니다. dailySemaId와 교체 콘텐츠를 구분하고 질문 전환은 로컬에서 처리합니다. | [05 §6.3](./05_API_SPEC.md) |
| D-API-016 | 실행 기한·terminal 이후 결과 보존·ack를 분리합니다. ack 뒤 최소 proof를 유지하고 만료 후에는 봉인·명시적 추적 종료를 적용합니다. | [05 §9.3·6.10](./05_API_SPEC.md) |
| D-API-017 | opaque answer ID를 passenger·generation에 묶고 없음·삭제·비소유를 ANSWER_NOT_FOUND로 통합해 존재 노출을 줄입니다. | [05 §6.8](./05_API_SPEC.md) |
| D-API-018 | 유효 prepare 뒤 같은 revision이 삭제되면 ALREADY_ABSENT 성공으로 합류합니다. 수정된 revision은 충돌로 보호합니다. | [05 §6.5](./05_API_SPEC.md) |
| D-API-019 | consent+passenger와 선택형 nickname 저장을 분리합니다. 닉네임 해제·무변경을 구분하고 필수 operation ID·revision으로 결과를 복구합니다. | [05 §6.2](./05_API_SPEC.md) |
| D-API-020 | 저장 성공 core는 고정하고 표시 정보만 독립 보강합니다. sourceRevision·observedAt과 RESOURCE_CHANGED로 최신 상태와 과거 proof를 구분합니다. | [05 §5.5](./05_API_SPEC.md) |
| D-API-021 | 환경별 HTTPS base URL 아래 /v1 resource API를 사용하고 화면 이름을 path에 넣지 않습니다. 채택 계약·비교 가설은 구분합니다. | [05 §7·1.2.1](./05_API_SPEC.md) |
| D-API-022 | 익명 키 원문은 OP-001 JSON body에서만 전송하고 이후 Bearer token을 사용합니다. 인증 정보의 반복 노출을 줄입니다. | [05 §7.1](./05_API_SPEC.md) |
| D-API-023 | 종류별 prepare와 공통 execute·result·ack·close를 조합합니다. 상태·권한·복구 계약을 유지하며 분할 방식은 05 §16에서 비교합니다. | [05 §6.4~6.7·6.10·16](./05_API_SPEC.md) |
| D-API-024 | HTTP 수락·전송 상태와 영속 결과를 분리합니다. terminal NOT_APPLIED는 result로 확인하고 timeout을 확정 실패로 보지 않습니다. | [05 §7.5·8.3](./05_API_SPEC.md) |
| D-API-025 | camelCase JSON·UTC timestamp·KST 날짜·opaque ID/cursor·private response no-store를 사용합니다. wire 형식의 원본은 OpenAPI입니다. | [05 §7](./05_API_SPEC.md) |

### 10.1 계약 원본·결과 수명·복구

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-API-026 | 제품 불변식·채택 wire/의미·구현 가설을 구분합니다. 동등성 비교가 현재 운영 계약의 무단 변경이 되지 않게 합니다. | [05 §1.2.1](./05_API_SPEC.md) |
| D-API-027 | COMPACT·STANDARD·EXPANDED와 limits·sourceRevision을 사용합니다. 서버 prefix를 유지하면서 화면 선택·예산은 IX-027에서 조정합니다. | [05 §5.3](./05_API_SPEC.md)·[04 §5.10](./04_INTERACTIONS_AND_COPY.md) |
| D-API-028 | prepare/execute를 유지하며 단일 영속 수락+조회+원자 종료를 합성 프로토타입에서 비교합니다. 지연·복구·복잡도 증거 없이 운영 계약을 대체하지 않습니다. | [05 §16](./05_API_SPEC.md) |
| D-API-029 | OpenAPI를 wire 원본으로 두고 타입·validator·Mock을 파생합니다. 오류·이벤트 allowlist와 의미 계약의 소유를 분리해 drift를 막습니다. | [05 §1.2.1·7.6·8](./05_API_SPEC.md) |
| D-API-030 | 시간·기기·재시도·종료 순서를 생성해 효과 최대 1회·원문 보존·삭제 후 부활 없음 등을 검증합니다. 내부 함수 일치 대신 Mock/실서버 의미 동등성을 봅니다. | [05 §15~16](./05_API_SPEC.md) |
| D-API-031 | PREPARED·EXECUTING을 구분하고 prepare 응답 유실은 같은 operation ID·입력으로 복구합니다. 실행·만료·close는 원자적으로 경쟁합니다. | [05 §6.4·6.7·6.10](./05_API_SPEC.md) |
| D-API-032 | terminal 이후 7일까지 최소 proof/오류를 유지하고 ack는 민감 표시 payload만 제거합니다. 삭제 후 제한 세션·recentDeletion·generation별 로컬 정리로 재접속을 복구합니다. | [05 §6.1·6.7·9.3](./05_API_SPEC.md) |
| D-API-033 | 승객 생성은 ACTIVE 세션을 명시 반환하고 같은 주체의 ACTIVE에서도 같은 생성 ID를 복구합니다. 생성 효과와 token 발급 수명을 분리합니다. | [05 §6.2](./05_API_SPEC.md) |
| D-API-034 | 닉네임은 필수 operation ID·최소 7일 receipt 재사용·이후 key 봉인을 적용합니다. fingerprint를 revision보다 먼저 확인해 재시도 충돌을 막습니다. | [05 §6.2](./05_API_SPEC.md) |
| D-API-035 | dailySemaId와 교체 가능한 semaId/version을 분리합니다. 콘텐츠 교체가 하루 한 활성 응답·저장 문맥을 바꾸지 않게 합니다. | [05 §6.3~6.4](./05_API_SPEC.md) |
| D-API-036 | 과거 성공 proof와 현재 표시를 sourceRevision·observedAt으로 구분합니다. 수정·삭제된 receipt 표시 정보는 RESOURCE_CHANGED로 처리합니다. | [05 §5.5·10.1](./05_API_SPEC.md) |
| D-API-037 | terminal 때 7일 결과 보존을 시작합니다. 만료 뒤 최소 봉인 registry와 OP-015 reconciliation으로 명시적 추적 종료를 제공합니다. | [05 §9.3·6.10](./05_API_SPEC.md) |
| D-API-038 | MVP 활성 데이터·raw 분석·명령/세션·삭제 receipt·접근 분리한 동의 증빙을 하나의 ACID 경계에서 처리합니다. 부분 삭제 뒤 보상 복원으로 NOT_APPLIED를 약속하지 않습니다. | [05 §10.3](./05_API_SPEC.md) |

## 11. 프런트엔드 구현 구조

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-030 | 하나의 composition root에서 화면·use case·API·platform port를 조립합니다. Query·UI·draft·command의 정본을 중복 소유하지 않습니다. | [06 §3~4](./06_FRONTEND_SPEC.md) |
| D-TECH-031 | token은 메모리, OP-001은 single-flight, route는 민감 identifier 없이 구성합니다. 정상 갱신과 주체 변경의 수명은 D-TECH-040·042를 따릅니다. | [06 §5](./06_FRONTEND_SPEC.md) |
| D-TECH-032 | generation별 manifest·독립 record와 exact read-back으로 mutation 선보관을 확인합니다. PRE 주체는 키 원문 대신 salted verifier로 대조합니다. timing·metadata는 D-TECH-043·046을 따릅니다. | [06 §7~9](./06_FRONTEND_SPEC.md) |
| D-TECH-033 | target별 직렬화·전체 삭제 fence와 유한 조회 cycle을 사용합니다. Abort를 서버 취소로 보지 않고 proof→로컬 반영→ack 순서를 지킵니다. 이탈·진척은 D-TECH-044·045를 따릅니다. | [06 §4.3·8](./06_FRONTEND_SPEC.md) |
| D-TECH-034 | terminal 뒤 최소 patch→재검증, generation별 cursor chain을 사용합니다. 누적 수는 목록과 독립 조회하며 cache key·갱신은 D-TECH-042·048을 따릅니다. | [06 §6](./06_FRONTEND_SPEC.md) |
| D-TECH-035 | wire 파생 영역과 domain adapter를 분리하고 SDK를 port 뒤에 둡니다. identity·Storage는 SDK-only, Overlay는 공통 Radix wrapper로 유지합니다. UI 선별은 D-TECH-050~052를 따릅니다. | [06 §2~3·10.1](./06_FRONTEND_SPEC.md) |
| D-TECH-036 | FE 분석 queue는 bounded·memory-only·best-effort이며 generation 변경·전체 삭제 때 폐기합니다. BE 성공 이벤트를 추정 생성하지 않습니다. | [06 §10.3~10.4](./06_FRONTEND_SPEC.md) |

### 11.1 구현·상태·복구

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-038 | 개발용 Mock 승객의 질문→작성→저장→다시 읽기부터 연결하고 각 slice에 실패·실기기 증거를 붙입니다. 운영 동의/탑승 우회는 배포하지 않습니다. | [06 §12](./06_FRONTEND_SPEC.md) |
| D-TECH-039 | 공통 장면 layout이 공간·모션을 소유하고 본문·서버 정본은 복제하지 않습니다. 화면 간 연결과 독립 표현 실험을 함께 지원합니다. | [06 §3.1·10.5](./06_FRONTEND_SPEC.md) |
| D-TECH-040 | 비본문 NavigationContext를 메모리에 두고 유효 identity/version의 선택·scroll·복귀 대상을 복원합니다. 주체·권한·generation 변경 때 폐기합니다. | [06 §5.6](./06_FRONTEND_SPEC.md) |
| D-TECH-041 | session·삭제 gate·metadata 확인 뒤 route query와 현재 대상 복구를 병행합니다. 비대상 청소를 첫 화면 뒤로 미뤄 안전한 진입을 단축합니다. | [06 §5.3](./06_FRONTEND_SPEC.md) |
| D-TECH-042 | ownerScope/generation cache key를 사용하고 정상 token 갱신에는 확인된 메모리 cache를 유지합니다. epoch fence·주체/권한 변경 폐기는 유지합니다. | [06 §4.2·6.1](./06_FRONTEND_SPEC.md) |
| D-TECH-043 | 500ms trailing·2초 maxWait 시작값, IME 종료 후 쓰기·최신 버전 병합·확인본 중복 쓰기 생략으로 보관 지연과 I/O를 줄입니다. | [06 §7.3](./06_FRONTEND_SPEC.md) |
| D-TECH-044 | 조회 예산과 이탈 시점을 분리합니다. ticket 전/후 복구정보 보관을 확인하면 대기 중 안전 이탈을 제공하고 경쟁 mutation은 잠급니다. | [06 §8.6](./06_FRONTEND_SPEC.md) |
| D-TECH-045 | 서버 판정·로컬 마무리·방문 피드백을 분리하고 단계별 진척으로 재개합니다. 알림 표식 하나로 정리를 생략하지 않습니다. | [06 §8.4~8.7](./06_FRONTEND_SPEC.md) |
| D-TECH-046 | root/manifest 교대 사본·sequence/checksum·단일 metadata 큐·삭제 tombstone/barrier를 사용합니다. SDK의 atomic replace를 가정하지 않습니다. | [06 §8.1~8.2](./06_FRONTEND_SPEC.md) |
| D-TECH-047 | 첫 작성부터 inline/bar를 실기기 비교하고 가능하면 같은 button DOM의 배치만 바꿉니다. 운영 기본값 변경은 Acceptance #37 증거 뒤입니다. | [06 §10.2·12](./06_FRONTEND_SPEC.md) |
| D-TECH-048 | 깊은 목록 위치의 최신 후보는 IX-042 안내·선택으로 적용합니다. 후보 실패·무효화 시 안내를 제거해 읽던 위치를 보존합니다. | [06 §6.3](./06_FRONTEND_SPEC.md) |
| D-TECH-049 | 질문·작성의 최소 자원과 후속 장식을 분리하고 실패를 장식 영역에 격리합니다. 각 slice에서 실제 기기 성능 baseline·예산을 확인합니다. | [06 §10.5·13.2](./06_FRONTEND_SPEC.md) |

### 11.2 픽셀 UI 선별 도입

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-050 | Pxlkit·Pixelact UI 등에서 CMP별 패키지·필요 소스·네이티브 구현을 비교합니다. 라이브러리 수를 제한하지 않고 화면은 ARCA CMP를 사용합니다. | [06 §2.4](./06_FRONTEND_SPEC.md) |
| D-TECH-051 | Tailwind를 허용하고 공통 CSS 변수로 토큰을 매핑합니다. Emotion은 필요한 자체 컴포넌트에 한정해 reset·theme·우선순위 충돌을 줄입니다. | [06 §2.5](./06_FRONTEND_SPEC.md) |
| D-TECH-052 | 네이티브 control·ARCA EGC/IME/보관 계약·공통 Radix Overlay를 유지합니다. 외부 UI의 절단·자동 닫기·중복 발표·logger 기본값을 연결하거나 제거합니다. | [06 §10.1·10.6](./06_FRONTEND_SPEC.md) |
| D-TECH-053 | 복수 출처의 UI·아이콘·생성 배경을 색·서체·픽셀 밀도·형태·상태·모션으로 통합합니다. 정적 fallback에서도 픽셀 정체성을 유지합니다. | [02 §1.4·8.2](./02_DESIGN_SYSTEM.md) |
| D-TECH-054 | CMP별 정확 버전/commit·원본·도입 방식·수정·로컬 경로·검증을 연결합니다. 권리·upstream 갱신·실제 production 비용과 회귀로 채택을 판단합니다. | [06 §2.4~2.5·13.2](./06_FRONTEND_SPEC.md) |

### 11.3 Mock 세계와 시나리오

| ID | 현행 선택과 이유 | 담당 명세 |
|---|---|---|
| D-TECH-055 | 하나의 불변 scenario definition과 전이 규칙에서 adapter·실행별 독립 runtime을 만듭니다. 공유 서버와 기기별 client/platform 세계를 분리해 domain adapter·MSW의 의미 동등성과 테스트 격리를 함께 유지합니다. | [07 §2](./07_MOCK_SCENARIOS.md#2-mock-세계와-책임-경계) |
| D-TECH-056 | 단일 registry를 개발 패널·test helper가 소비하고 URL·사용자 데이터에는 scenario state를 넣지 않습니다. Mock composition root는 운영 build에서 제외하며 전체 reset과 Storage를 보존하는 기기 restart를 구분합니다. | [07 §4](./07_MOCK_SCENARIOS.md#4-시나리오-식별선택초기화) |
| D-TECH-057 | 검증된 base와 타입 있는 delta를 사용하고 정상 world의 cross-field 불변식을 항상 확인합니다. domain 거절은 유효 world와 요청으로, malformed 응답은 한 경계만 깨뜨리는 ProtocolFault로 분리합니다. | [07 §3](./07_MOCK_SCENARIOS.md#3-fixture-모델) |
| D-TECH-058 | server UTC/KST·기기 wall clock·monotonic elapsed time을 분리하고 fault를 요청 수락·commit과 journal checkpoint에 결합합니다. background·late response·부분 쓰기를 실제 결과와 혼동하지 않게 합니다. | [07 §5~7](./07_MOCK_SCENARIOS.md#5-가상-시간과-scheduler) |
| D-TECH-059 | 공유 서버의 두 기기 사건을 결정적 barrier로 interleave하고 command 사건 대수·stateful query를 공통으로 사용합니다. P0 이름 있는 시나리오에 pairwise delta와 seed 기반 상태 전이 생성을 더해 조합 폭과 누락을 함께 줄입니다. | [07 §8~12](./07_MOCK_SCENARIOS.md#8-command다중-기기동시성) |

## 12. 이전 ID의 대체 안내

아래 ID는 과거 계약의 재적용을 막기 위한 연결입니다. 현행 결론·유지 범위를 확인하고 담당 명세를 직접 참조합니다.

| 이전 ID | 현행 결정 | 적용 범위 | 담당 명세 |
|---|---|---|---|
| D-UI-005 | D-UI-009·D-UI-033 | TDS·밝은 기능 영역 의무는 해제; 플랫폼 경계·현행 테마 적용 | [01 §4](./01_UI_OVERVIEW.md) |
| D-UI-015 | D-UI-033·D-UI-036 | 밝은 입력 의무 대신 현행 record 문맥·내용 기반 입력 확장 적용 | [02 §9.4](./02_DESIGN_SYSTEM.md) |
| D-UI-019 | D-UI-039 | 응답 중심 한 열 목록; 2px 구분선 강제 없음 | [03 §6.1](./03_SCREENS_SPEC.md) |
| D-UI-025 | D-UI-040 | 고정 원본 폭·중앙 crop 대신 장면별 구도; 정수 배율·권리·용량 예산 유지 | [02 §8.1](./02_DESIGN_SYSTEM.md) |
| D-UI-041 | D-UI-055 | 인트로 5장면 고정 해제; 건너뛰기·원문 읽기 유지 | [03 §4.2](./03_SCREENS_SPEC.md) |
| D-UI-043 | D-UI-056·D-UI-078 | 중간 완료 단계 대신 단일 진행·실패 뒤 명시적 건너뛰기 | [03 §4.4](./03_SCREENS_SPEC.md) |
| D-UI-044 | D-UI-057·D-UI-062 | 미응답과 완료의 정보 위계를 구분 | [03 §5.1](./03_SCREENS_SPEC.md) |
| D-UI-047 | D-UI-061·D-UI-081 | 첫 기억·반복·수 미확인을 구분하고 최초 조작 가능 시 버튼 위계 고정 | [03 §5.3](./03_SCREENS_SPEC.md) |
| D-UI-050 | D-UI-065·D-UI-066 | 질문 서문·응답 주 읽기 영역, 수정·삭제는 보조 행동 | [03 §6.2](./03_SCREENS_SPEC.md) |
| D-TECH-007 | D-TECH-022 | TDS 전용 프리셋 대신 일반 react-ts 사용 | [06 §2.2](./06_FRONTEND_SPEC.md) |
| D-TECH-011 | D-TECH-023·D-TECH-050~052 | TDS 제외; UI 선별·Tailwind 허용·Emotion 선택 사용 | [06 §2.4~2.5](./06_FRONTEND_SPEC.md) |
| D-TECH-037 | D-TECH-038·D-TECH-047 | 핵심 Mock 흐름과 첫 작성의 저장 버튼 비교; inline 운영 시작값·#37 게이트 유지 | [06 §10.2·12](./06_FRONTEND_SPEC.md) |
| D-API-008 | D-API-027 | 화면명 기반 발췌 대신 공통 프로필·실제 limits; 서버 prefix·FE overflow 판정 유지 | [05 §5.3](./05_API_SPEC.md) |
