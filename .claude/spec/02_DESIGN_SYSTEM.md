# ARCA Design System

- 문서 버전: v1.16
- 최근 수정일: 2026년 9월 30일
- 상태: 확정
- 승인 주체: 제품 책임자
- 시각 검증: 현행 코드 UI 채택·합성 브라우저 비교 완료, 실제 토스 WebView 검증은 남음(08 §14.1)

토큰·CMP·픽셀아트·모션·접근성의 원본입니다. 실제 에셋 권리·확보 상태는 [Asset Manifest · L1–10](../../design/assets/ASSET_MANIFEST.md)가 소유합니다.

### 최소 읽기 경로

현재 파일은 `.claude/spec/02_DESIGN_SYSTEM.md`입니다. 필요한 절부터 읽습니다. 경로·줄 힌트 사용법은 [00 §3 · L49–55](./00_INDEX.md#3-참조-방향과-중복-방지)을 따릅니다.

| 작업 | 읽을 위치 |
|---|---|
| 외부 UI 시각 통합 | [§1.4 · L49–56](#14-서로-다른-출처의-시각-통합) → [06 §2.4 · L97–122](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적) |
| 색·서체·간격·형태 | [§2 · L58–96](#2-토큰-문법과-테마-구조) → [§3 · L98–163](#3-색상-토큰)·[§4 · L165–210](#4-타이포그래피)·[§5 · L212–258](#5-간격크기레이아웃-토큰)·[§6 · L260–310](#6-형태테두리그림자레이어) |
| 모션·아이콘·에셋 | [§7 · L312–366](#7-모션과-햅틱) → [§8 · L368–432](#8-픽셀아트아이콘에셋) |
| 공통 컴포넌트 | [§9.1 · L436–470](#91-전체-목록) → 해당 CMP 절 → [§10 · L575–594](#10-상태-적용-행렬) |
| 비동기·접근성 | [§11 · L596–614](#11-비동기빈-상태오류-조합) → [§12 · L616–653](#12-접근성-계약) |
| 원본·시각 채택 상태 | [§13 · L655–683](#13-디자인-원본과-개발-전달) |

## 1. 시스템 목표와 적용 경계

### 1.1 목표

앱 소유 화면은 **고요한 픽셀 심우주 관측실**의 브랜드 문법을 사용합니다. 장면·아이콘·주요 행동에 픽셀 표현을, 읽기 영역에는 역할별 서체·면·여백을 적용합니다. 모든 글자와 surface에 같은 장식 강도를 적용하지 않습니다. 감정 곡선·금지 표현은 [01 §3 · L42–80](./01_UI_OVERVIEW.md#3-비주얼-방향)을 따릅니다. 화면당 Primary는 최대 하나이며 최초 저장 연출은 최대 2초입니다.

### 1.2 플랫폼과 앱 소유 UI

| 영역 | 소유자 | 규칙 |
|---|---|---|
| 화면 상단 Navigation | 앱인토스 플랫폼 | 최신 비게임 가이드를 그대로 따르며 ARCA 픽셀 스타일로 위장하지 않음 |
| 루트 화면의 플로팅 탭 외곽 형식 | 앱인토스 플랫폼 규격 | F10·F20·F30에서만 사용하고 공식 형태를 우선함 |
| Navigation 아래 화면 전체 | ARCA | `CMP-001 PixelAppShell` 아래에서 역할별 서체와 장식 위계를 갖는 ARCA 시스템 적용 |
| 버튼·입력·목록·상태·Overlay | ARCA | 네이티브 의미와 ARCA 토큰·CMP 계약을 기준으로 외부 컴포넌트와 자체 구현 통합 |
| 복잡한 Dialog·Sheet 동작 | ARCA 시각, headless 동작 | headless primitive는 포커스·ARIA·Dismiss만 담당하고 스타일을 제공하지 않음 |

앱 소유 UI는 TDS Mobile 컴포넌트를 사용하지 않습니다. Navigation 아래에 공통 앱 헤더를 한 번 더 만들지 않으며, 필요한 제목은 콘텐츠 내부 `CMP-002 ScreenTitle`로 표시합니다([D-UI-017 · L45](./DECISIONS.md#3-design-system-결정)).

### 1.3 구현 책임 경계

- 네이티브 `button`, `a`, `input`, `textarea`, `input[type="checkbox"]`의 의미와 기본 상호작용을 보존합니다.
- headless primitive는 `CMP-017 PixelAlertDialog`와 `CMP-018 PixelSheet`의 portal, focus trap, 배경 격리, Escape·Dismiss와 포커스 복귀만 보강합니다.
- Pxlkit·Pixelact UI 등에서 필요한 컴포넌트·스타일을 선별하고 네이티브 구현·headless 동작과 함께 사용할 수 있습니다. 특정 라이브러리 하나로 제한하지 않으며 외부 theme도 아래 통합 기준에 맞춥니다(D-TECH-050~053).
- Tailwind 사용을 허용하며 Emotion은 필수 기반이 아닙니다. 패키지·편입 소스·버전·import·CSS 구성과 유지보수 기록은 [06 §2.4~§2.5 · L97–122](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적)가 소유합니다. 입력/Overlay 계약은 04와 [06 §10.1 · L606–616](./06_FRONTEND_SPEC.md#101-dialogsheet-wrapper)·§10.6을 따릅니다.

### 1.4 서로 다른 출처의 시각 통합

- 모든 채택 CMP는 같은 의미 기반 색·서체 역할·간격·형태·상태·모션 토큰을 사용합니다. 외부 기본값은 ARCA 토큰에 매핑하며 라이브러리별 팔레트·테마를 별도로 유지하지 않습니다.
- 계단형 모서리의 셀 크기, 테두리 두께와 단단한 그림자는 §2·§6을 기준으로 맞춥니다. 다른 구현 기법도 같은 픽셀 밀도·위계로 보이게 하며, 모든 면에 같은 장식 강도를 요구하지 않습니다.
- 기본·눌림·포커스·비활성·로딩·오류 상태를 함께 비교합니다. clip/mask와 그림자가 포커스 선·확대된 글자·조작 영역을 잘라서는 안 됩니다. 외부 모션은 §7의 사건·시간·Reduced Motion 기준을 적용합니다.
- 외부 픽셀 폰트·강제 대문자·아이콘 기본값을 그대로 적용하지 않고 §4의 Neo둥근모/Pretendard 본문 역할과 §8.2의 아이콘 규칙으로 연결합니다.
- 생성 배경과 UI는 같은 팔레트 역할·픽셀 밀도·명암·텍스트 안전 영역을 기준으로 비교합니다. 생성 지시와 납품 기준은 Asset Manifest에 연결하고, 출력물의 픽셀 선명도·정수 배율을 실제 표시 크기에서 확인합니다. 질문·응답·조작은 실제 DOM으로 유지합니다.
- 정적 셸·주요 행동·아이콘에서도 픽셀 정체성을 읽을 수 있어야 합니다. 배경 로딩 실패·Reduced Motion에서도 이 문법과 본문 가독성을 유지합니다. 시각 채택은 §13.3에서 추적합니다.

## 2. 토큰 문법과 테마 구조

### 2.1 이름과 코드 매핑

토큰은 값이 아니라 의미로 이름을 붙입니다. 문서와 Figma에서는 점 표기, CSS에서는 동일한 순서의 kebab-case 변수를 사용합니다.

| 문서·Figma 이름 | CSS 변수 예시 |
|---|---|
| `color.bg.canvas` | `--color-bg-canvas` |
| `color.text.on-dark.primary` | `--color-text-on-dark-primary` |
| `space.500` | `--space-500` |
| `motion.duration.base` | `--motion-duration-base` |
| `layer.dialog` | `--layer-dialog` |

- 운영 컴포넌트는 의미 기반 토큰을 사용합니다. 별도 프로토타입에서는 임시 값으로 실험할 수 있으며, 채택 시 이 문서와 코드 토큰으로 통합합니다(§2.3·§13).
- 의미가 유지된 값 변경은 같은 토큰 이름을 유지하고, 의미가 달라지면 새 토큰을 만듭니다.
- Figma 변수와 코드 변수는 이 문서의 이름·값을 일대일로 매핑합니다.
- ARCA MVP는 `arca-default` 조합 한 벌만 제공합니다. 질문·작성·저장은 낮은 명도의 연속성을 기본으로 하고, 긴 문서 등에 선택하는 밝은 surface도 같은 테마의 내용 문맥입니다([D-UI-033 · L90](./DECISIONS.md#6-시각-표현과-탐색)).
- 시스템 테마 자동 추종과 별도 다크 모드 변형은 제공하지 않습니다.

### 2.2 단위 원칙

- 글자 크기와 행간은 `rem`으로 구현해 사용자 글자 확대를 따릅니다.
- 레이아웃, 간격, 테두리와 아이콘 표시 크기는 CSS px을 사용합니다.
- 기본 레이아웃 셀은 4 CSS px입니다.
- 2px 값은 선 두께와 승인된 Pressed 위치·shadow 변화처럼 지정된 세부 표현에 사용합니다.
- 픽셀 정렬보다 200% 글자 확대, 320px reflow와 조작 가능성을 우선합니다.

### 2.3 이 문서의 결정 강도

[00 §7.1 · L143–163](./00_INDEX.md#71-결정-강도와-자율-탐색)의 분류를 다음과 같이 적용합니다. 이 문서의 `확정`은 방향과 필수 계약의 승인이며 시각 검증 완료를 뜻하지 않습니다.

| 강도 | 이 문서의 범위 | 적용 |
|---|---|---|
| 필수 계약 | 플랫폼 경계, 네이티브 의미·상태·접근성, 원문 발췌 규칙, 서버 성공 뒤 연출, 최대 2초·Reduced Motion, 에셋 권리·용량 상한 | 프로토타입도 준수하며 제품 의미·데이터를 임의로 변경하지 않음 |
| 조정 가능한 기본값 | §3 색 값, §4 타입 크기·행간, §5 장식 간격·입력 초기 줄 수, §6 장식 강도, §7의 상한 이내 타이밍 | 승인 방향과 필수 대비·타깃·reflow를 만족하는 범위에서 자율 비교·조정 후 채택값 기록 |
| 권장 시작안·탐색 가능한 표현 | §7.3 기록편 형성, §8.1 장면 구도, §8.3 JOY 형상, 정보 묶음·배치·핵심 흐름의 공간 연결 | 03의 검증할 결과를 보존하는 대안을 별도 프로토타입에서 비교하고 §13의 시각 채택으로 확정 |

역할별 서체, 낮은 명도 연속성, 화면 상태에 따른 질문·응답의 위계는 승인된 방향입니다. 미응답은 질문 우선, 완료 홈은 저장 당시 질문과 완료 문구·상세 진입, 상세는 질문 서문 뒤 응답의 읽기 집중을 따릅니다([D-UI-057·D-UI-097·D-UI-065](./DECISIONS.md)). 승인 방향을 바꾸는 배치는 새 결정으로 기록합니다.

## 3. 색상 토큰

### 3.1 기반·경험 색상

| 토큰 | 값 | 용도 |
|---|---:|---|
| `color.bg.canvas` | `#090F1D` | 앱 셸과 깊은 우주 배경 |
| `color.bg.scene` | `#111E32` | ScenePanel과 장면 전경 surface |
| `color.bg.record` | `#19263A` | 작성·기록의 잉크색 surface 기본안 |
| `color.bg.document` | `#F4F7FB` | 정책·장문 등에 선택하는 밝은 surface |
| `color.bg.inset-dark` | `#0D1728` | 어두운 surface 안 보조 그룹 |
| `color.bg.inset-light` | `#E7EDF5` | 밝은 surface 안 보조 그룹 |
| `color.text.on-dark.primary` | `#F4F7FB` | 어두운 surface의 본문 |
| `color.text.on-dark.secondary` | `#AFBDD0` | 어두운 surface의 보조 정보 |
| `color.text.on-light.primary` | `#090F1D` | 밝은 surface의 본문 |
| `color.text.on-light.secondary` | `#425574` | 밝은 surface의 보조 정보 |
| `color.border.on-dark` | `#607795` | 어두운 문맥에서 식별이 필요한 조작 경계 |
| `color.border.on-light` | `#7890AD` | 밝은 문맥에서 식별이 필요한 조작 경계 |
| `color.brand.primary` | `#3659BC` | Primary 행동과 브랜드 식별 |
| `color.signal` | `#9ADBDC` | JOY·SEMA 신호 |
| `color.memory` | `#B4A0EF` | 기억 조각·누적 수·저장 완료의 제한된 빛 |
| `color.warmth` | `#C98A3D` | 제한된 온기 강조, 기능 상태에 사용 금지 |
| `color.signal.step-1 / 2 / 3` | `#509DAB / #265367 / #172F43` | 신호 장면의 불투명 명도 단계 |
| `color.memory.step-1 / 2 / 3` | `#8068BF / #493B76 / #282541` | 기억 기록편의 불투명 명도 단계 |
| `color.brand.primary.deep` | `#253C79` | Primary의 낮은 단차 |
| `color.bg.scene.raised` | `#22354E` | 장면 안 control |
| `color.bg.canvas.deep` | `#050B15` | 장면의 먼 배경 |
| `color.border.subtle` | `#2D4059` | 비상호작용 구분선 |
| `color.brand.edge` | `#91ABE9` | Primary 외곽 |
| `color.tap-highlight` | `transparent` | 앱 전체 브라우저 tap 배경 제거(`html`에서 상속). 조작 반응은 각 control의 눌림으로 표현 |
| `color.dimmer` | `rgba(3, 8, 18, 0.85)` | PixelAlertDialog·PixelSheet 공통 배경 딤, 블러 없음 |
| `color.sky.night.1~4 / horizon` | `#050B15 / #090F1D / #0D1728 / #111E32` / `#172F43` | F10 캡슐 배경의 유리 너머 하늘, 20–05시 |
| `color.sky.dawn.1~4 / horizon` | `#0B1430 / #15204A / #2A2E5E / #4B3D6E` / `#7A5A6E` | 05–08시 |
| `color.sky.day.1~4 / horizon` | `#0E2244 / #143058 / #1B3D6B / #24497A` / `#3A5F94` | 08–17시 |
| `color.sky.dusk.1~4 / horizon` | `#0C1330 / #221D46 / #3D2448 / #5E2F45` / `#C98A3D` | 17–20시 |
| `color.sky.star / star-bright` | `#607795 / #AFBDD0` | 유리 너머 별. 흐린·밝은·십자 반짝임 세 종류, 밤 49·새벽/노을 24(위쪽만)·낮 10개 |
| `color.capsule.display.fill / line` | `rgb(25 38 58 / 0.90)` / `#509DAB` | F10 캡슐 디스플레이의 반투명 채움(`bg.record` 90%)과 테두리 |

하늘 토큰은 F10 캡슐 배경의 유리 너머에만 쓰는 장면 팔레트입니다. 위(머리 쪽)에서 아래(발 쪽)로 1→4→horizon 순서이며, 각 색을 156 격자의 16·60·96·120행, horizon을 136행에 두고 그 사이를 2행 단위로 섞은 색(`color-mix(in oklab)`)으로 잇습니다. 섞기 미지원 WebView는 가까운 토큰 색을 씁니다. 글자·조작은 하늘 위에 두지 않습니다(노을 horizon은 흰 글자와 2.7:1).

캡슐 디스플레이는 `color.capsule.display.fill` 한 겹(가장자리·가운데 같은 투명도)과 `signal.step-1` 픽셀 테두리로 칠합니다. 가장 밝은 배경(`#AFBDD0` 별·유리 반사) 위에서도 본문 대비 4.5:1 이상인 불투명도만 씁니다.

값의 코드 원본은 `src/ui/tokens.css`입니다. 네이비 바탕 → 장면 → 기록 면의 명도 차이로 깊이를 만들며 브랜드 블루는 주 행동, 시안은 JOY·신호·포커스, 바이올렛은 기억 표식에 제한합니다. 단계 색은 본문색이나 감정·기능 상태색으로 사용하지 않습니다.

`color.signal`, `color.memory`, `color.warmth`는 각각 도메인 경험을 나타내며 Success, Warning, Danger의 대체색으로 사용하지 않습니다. 넓은 본문 배경이나 긴 본문 글자에도 사용하지 않습니다.

### 3.2 기능 상태 색상

| 의미 | 밝은 surface 전경 | 밝은 surface 배경 | 어두운 surface 전경 | 어두운 surface 배경 |
|---|---:|---:|---:|---:|
| Success | `#176B4D` | `#E7F7EF` | `#63D7A4` | `#123829` |
| Warning | `#8A5A00` | `#FFF4D6` | `#F2B84B` | `#3A2A10` |
| Danger | `#B4232D` | `#FDECEE` | `#FF7A82` | `#3F1D27` |
| Info | `#2457E6` | `#EEF3FF` | `#89A7FF` | `#172B5F` |

각 쌍은 전경과 배경 사이 일반 텍스트 대비가 4.5:1을 넘습니다. 코드 토큰은 `--color-status-{의미}-on-dark-{fg|bg}`이며, 밝은 surface 열은 밝은 surface를 도입할 때 같은 형식으로 추가합니다. 상태는 색만으로 전달하지 않고 아이콘과 문구를 함께 사용합니다([D-UI-022 · L49](./DECISIONS.md#3-design-system-결정)).

### 3.3 대비 기준

| 대상 | 최소 기준 | 적용 예 |
|---|---:|---|
| 일반 텍스트 | 4.5:1 | 본문, Label, 버튼 문구, 오류 문구 |
| 큰 텍스트 | 3:1 | WCAG 큰 텍스트 조건을 만족하는 Display |
| 아이콘·테두리·포커스 | 3:1 | 조작 경계와 선택·포커스 상태 |

Primary 버튼의 흰 텍스트는 5.90:1, record 위 보조 텍스트는 7.98:1입니다. 기능상 필요한 경계에는 `border.on-dark`를 사용하고 낮은 대비의 `border.subtle`은 장식 구분선·비활성 경계에만 사용합니다. 픽셀 프레임은 CSS 배경 레이어라 axe 색 대비 일부를 자동 판정하지 못하므로 토큰 계산으로 확인합니다.

## 4. 타이포그래피

### 4.1 서체

| 토큰 | 값 |
|---|---|
| `font.family.pixel` | `Neo둥근모 v1.601 Regular, system-ui, Apple SD Gothic Neo, sans-serif` |
| `font.family.body` | `Pretendard v1.3.9 Regular, system-ui, Apple SD Gothic Neo, sans-serif` |
| `font.family.fallback` | `system-ui, Apple SD Gothic Neo, sans-serif` |
| `font.weight.regular` | `400` |
| `font.letter-spacing.default` | `0` |

- 픽셀·본문 역할의 공식 Regular WOFF2를 `public/fonts/`에 self-host하고 외부 CDN에서 불러오지 않습니다. 본문 파일은 subset하지 않은 전체 파일입니다([D-UI-103 · L279](./DECISIONS.md#114-현행-ui와-입력-표시)).
- 두 서체 모두 `font-display: swap`으로 로드 전·실패 시 fallback 서체로 즉시 읽히며, 어떤 동작도 폰트 로드를 기다리지 않습니다.
- 픽셀 서체에는 `font-synthesis: none`으로 Bold·Italic 합성을 막습니다. 본문도 Regular 한 굵기만 사용합니다.
- 강조는 굵기 대신 크기, 여백, 색상, 테두리와 문장 위계로 표현합니다.
- Neo둥근모·Pretendard에 없는 이모지·문자는 fallback 서체로 표시하며, 누락 글리프를 숨기지 않습니다.
- 각 폰트 파일과 SIL Open Font License 1.1·저작권 고지를 함께 보존합니다.

### 4.2 역할별 서체

두 서체만 사용합니다. 픽셀 서체는 짧은 표지와 조작에, 본문 서체는 계속 읽는 문장에 적용합니다.

| 역할 | 서체 | 적용 |
|---|---|---|
| 브랜드·화면 제목·짧은 Label·조작 | `font.family.pixel` | ARCA, 화면 제목, JOY 발신자, 필드 Label, 월 제목, 설정 항목 이름, 누적 수, 버튼·탭 |
| 질문·사용자 입력·응답·설명·메타 | `font.family.body` | 오늘 질문·질문 서문, 인트로 설명, 목록 질문, 날짜·글자 수·보관 안내 |

질문은 짧은 JOY Label과 분리해 본문 서체로 표시합니다. 답변·닉네임·문장에는 픽셀 서체를 쓰지 않습니다.

### 4.3 타입 스케일

실제 글자 크기는 **20 / 16 / 14px의 세 종류**입니다. 기준은 브라우저 기본 16px이며 CSS에는 rem을 사용합니다. 의미별 alias는 세 기반 토큰만 참조합니다.

| 기반 토큰 | CSS 크기 | 기본 행간 | 의미별 alias·용도 |
|---|---:|---:|---|
| `type.size.title` | `1.25rem` / 20px | `2rem` / 32px | display·screen-title·question·question-lead: 화면 제목, 오늘 미응답의 주 질문 |
| `type.size.body` | `1rem` / 16px | `1.75rem` / 28px | body·reading·narrative: 입력, 답변, 목록 질문, 인트로·설명 |
| `type.size.caption` | `0.875rem` / 14px | `1.25rem` / 20px | caption: 날짜·코드·보관 상태·글자 수·보조 Label |

`type.control`은 body 크기와 `1.5rem` / 24px 행간을 사용합니다. 작성·수정·상세·완료 홈의 질문은 body 크기·보조색의 조용한 서문입니다. ARCA 워드마크도 title 크기를 사용합니다.

- `html` 글자 크기를 px로 잠그지 않습니다. 기본 100%, 검증 200%를 사용합니다.
- 질문·응답 전문을 말줄임하지 않습니다. F20 목록 질문만 04 IX-027의 일부 표시 규칙을 사용하며 답변은 상세에서 읽습니다.
- 날짜·코드·카운터는 caption을 쓰며 고정 문자 폭을 추정하지 않습니다.
- 큰 글자에서 버튼·메타는 줄바꿈하고 높이가 늘어나며 잘리거나 겹치지 않습니다. 서체 미지원 글리프는 시스템 fallback으로 읽습니다.

## 5. 간격·크기·레이아웃 토큰

### 5.1 간격

| 토큰 | 값 |
|---|---:|
| `space.100` | `4px` |
| `space.200` | `8px` |
| `space.300` | `12px` |
| `space.400` | `16px` |
| `space.500` | `20px` |
| `space.600` | `24px` |
| `space.800` | `32px` |
| `space.1000` | `40px` |
| `space.1200` | `48px` |
| `space.1600` | `64px` |

### 5.2 전역 레이아웃

| 토큰 | 값 | 규칙 |
|---|---:|---|
| `layout.viewport-min` | `320px` | 이 폭에서 가로 스크롤 없이 검증 |
| `layout.content-max` | `480px` | 넓은 환경에서 가운데 정렬 |
| `layout.gutter` | `20px` | 기본 좌우 여백 |
| `layout.gutter-compact` | `16px` | 360px 미만 좌우 여백 |
| `layout.breakpoint-compact` | `360px` | 유일한 너비 축약 분기 |
| `layout.target-min` | `44px` | 독립 조작 요소의 최소 너비·높이 |
| `layout.button-height` | `52px` | 기본 Button 최소 높이 |
| `layout.icon-button` | `44px` | IconButton 정사각 타깃 |
| `layout.textarea-initial-lines` | `4` | F11·F22 작성·수정 Textarea의 초기 줄 수, 본문 행간으로 계산. 그 밖의 Textarea(F13 읽기 전용 등)는 3줄 |
| `layout.tabs-height` | 계산값 | 루트 탭 높이(control 행간 + 안쪽 여백 + 테두리). 콘텐츠 하단 여유·scroll margin·맨 위로 버튼 위치의 기준 |
| `layout.capsule-display-offset` | `8dvh` | F10 캡슐 디스플레이의 위쪽 여백 |

- 레이아웃은 항상 한 열이며 화면 폭 증가로 2열 카드·타일로 바꾸지 않습니다.
- 주 스크롤은 세로 문서 흐름으로 두고 페이지 가로 스크롤은 금지합니다. Textarea는 내용에 맞춰 페이지 안에서 확장하며 고정 px 상한 뒤 내부 스크롤로 전환하지 않습니다.
- 480px보다 넓은 WebView에서도 배경은 전체를 채우고 콘텐츠만 최대 폭으로 제한합니다.
- 버튼 그룹은 기본적으로 세로로 쌓습니다. 짧은 두 행동의 쌍(삭제 확인의 취소·삭제, 닉네임 편집의 취소·저장, 전체 삭제 단계의 행동 쌍)은 한 줄 두 버튼으로 두고, 좁은 폭·큰 글자에서 한 버튼이 최소 폭(8rem)을 확보하지 못하면 줄바꿈합니다.
- 고정 행동 또는 루트 탭이 있다면 콘텐츠 끝에 동일한 높이와 Safe Area를 포함한 여유 공간을 확보합니다.
- F11·F22의 저장은 문서 흐름 안 inline 하나입니다. 저장 행동은 한 벌만 노출·조작·포커스 가능하며 본문·커서·오류를 가리지 않습니다. 조건과 검증 기준은 [03 F11 · L379–442](./03_SCREENS_SPEC.md#52-f11--응답-작성)·Acceptance #37을 따릅니다([D-UI-059 · L121](./DECISIONS.md#8-핵심-경험과-화면별-위계)).

### 5.3 Safe Area와 키보드

- `CMP-001 PixelAppShell`이 `env(safe-area-inset-left/right/bottom)`과 플랫폼 Navigation 아래 시작점을 한 번만 처리합니다.
- 실제 inline padding은 각 방향에서 현재 gutter와 Safe Area 중 큰 값을 사용합니다.
- 입력 포커스 시 Visual Viewport 변화와 키보드 높이 대응은 `06`이 구현하며, Label·커서·오류·글자 수·저장 행동을 확인 가능한 위치로 스크롤합니다.
- 키보드가 열린 동안 루트 플로팅 탭을 새로 노출하지 않습니다.
- Android 시스템 뒤로가기는 먼저 열린 Dialog·Sheet, 다음 라우트, 마지막 플랫폼 종료 순서의 공통 셸 정책을 따릅니다. 정확한 확인 조건은 `04`가 소유합니다.

## 6. 형태·테두리·그림자·레이어

### 6.1 픽셀 형태

| 토큰 | 값 | 용도 |
|---|---:|---|
| `pixel.cell` | `4px` | 계단형 모서리·픽셀 단차·점선 구분선의 한 셀 |
| `corner.control` | `4px` | Button, Checkbox, 작은 상태 |
| `corner.panel` | `8px` | RecordPanel, InsetPanel, Toast |
| `corner.scene` | `12px` | ScenePanel, Dialog, Sheet |
| `border.default` | `2px` | 경계 식별이 필요한 조작 요소·outlined surface |
| `border.none` | `0` | 읽기·보조 영역의 테두리 없는 면 |
| `corner.none` | `0` | 별도 모서리 장식이 없는 읽기·보조 영역 |
| `focus.width` | `2px` | 키보드 포커스 선 |
| `focus.offset` | `2px` | 외곽선과 컴포넌트 사이 간격 |
| `shadow.raised` | `4px 4px 0` | 선택된 raised surface. Primary는 대신 brand edge 외곽과 brand deep 하단 단차(1셀)로 표현 |
| `shadow.pressed` | `2px 2px 0` | Pressed 상태 |

계단형 실루엣은 `pixel.cell` 단위로 모서리를 직각으로 잘라 그리며, 프레임별 셀 수는 아래와 같습니다. `corner.*`는 코드 토큰으로 정의되어 있으나 프레임 모서리는 셀 수를 따릅니다.

| 프레임 | 모서리 | 적용 |
|---|---|---|
| outlined(`arca-px`) | 1셀 계단 + `border.default` 선 | Button(framed variant), 입력, Checkbox, 루트 탭, 맨 위로, Dialog·Sheet, 캡슐 디스플레이 |
| plain(`arca-plain`) | 2셀 계단 면, 선 없음 | ScenePanel, RecordPanel |
| plain-small(`arca-plain-small`) | 1셀 계단 면, 선 없음 | InsetPanel, MemoryRow, MemoryCount |

읽기·보조 영역은 plain 표현으로 외곽선을 생략하고 면·여백으로 구분할 수 있습니다. 비상호작용 면마다 테두리를 요구하지 않습니다([D-UI-034 · L91](./DECISIONS.md#6-시각-표현과-탐색)). 입력 경계·포커스·선택 상태는 독립적으로 식별 가능해야 합니다. 구분선은 `border.subtle` 1셀 간격 점선(`arca-rule`, 월 제목·설정 그룹 제목 뒤)이나 2px 실선(MemoryRow·설정 행 하단)입니다.

Blur shadow, backdrop blur, glass surface, 연속 gradient glow와 hover 발광은 사용하지 않습니다. 예외는 F10 캡슐 디스플레이의 블러 없는 반투명 채움(`color.capsule.display.fill`)뿐입니다(D-UI-095). 제한된 신호·기억 장면의 발광은 불투명 픽셀 블록의 단계적 명도 차이로 표현합니다.

### 6.2 투명도

| 토큰 | 값 | 제한 |
|---|---:|---|
| `opacity.decorative-muted` | `0.72` | 정보가 아닌 장식에만 사용(버튼 처리 중 점 표시 등) |
| `opacity.disabled` | `0.48` | 예약 토큰. 텍스트·control 전체에 적용하지 않음 |

배경 딤은 `color.dimmer`(§3.1)입니다. 본문이나 오류 문구를 opacity만 낮춰 보조색으로 만들지 않습니다. Disabled는 opacity 대신 채움·경계·단차 제거·보조색 글자·cursor로 구분하고 글자의 대비를 유지합니다.

### 6.3 레이어

| 토큰 | 값 | 대상 |
|---|---:|---|
| `layer.content` | `0` | 기본 문서 흐름 |
| `layer.raised` | `10` | raised surface와 장식 |
| `layer.app-sticky` | `20` | 루트 탭·맨 위로 버튼 등 앱 내부 고정 요소(탭 아래 불투명 canvas 띠는 한 단계 아래) |
| `layer.sheet` | `30` | Dimmer |
| `layer.dialog` | `40` | PixelAlertDialog·PixelSheet |
| `layer.toast` | `50` | 차단 Overlay가 없을 때의 Toast |

플랫폼 Navigation과 공식 플로팅 탭은 이 앱 내부 숫자로 덮으려 하지 않습니다. 차단형 Overlay가 열린 동안 새 Toast는 화면에 중첩하지 않고 Overlay가 닫힌 뒤 전달하거나 해당 Overlay 안의 상태로 흡수합니다.

## 7. 모션과 햅틱

### 7.1 모션 토큰

| 토큰 | 값 | 용도 |
|---|---:|---|
| `motion.duration.instant` | `0ms` | Pressed 위치·shadow 변화 |
| `motion.duration.fast` | `120ms` | 작은 상태·아이콘 변화 |
| `motion.duration.base` | `180ms` | 화면 진입 fade(본문·새로 나타나는 루트 탭·준비된 F10 캡슐 배경), 맨 위로 버튼의 나타남·사라짐 |
| `motion.duration.state` | `200ms` | 버튼의 활성·비활성·처리 중 전환 때 면·테두리·글자 색과 Primary 단차의 fade(`motion.easing.settle`) |
| `motion.duration.scene` | `320ms` | F01 장면 교체(다음 장면이 이전 장면 위로 겹쳐 나타남)와 마지막 문장 뒤 대화창 퇴장·탑승 Primary 등장 |
| `motion.duration.depart` | `900ms` | F01 탑승 Primary 뒤 인트로가 바탕색으로 가라앉는 페이드 전용 |
| `motion.duration.memory` | `1600ms` (제품 상한 2000ms) | 최초 저장 기억 조각 형성 전용 |
| `motion.duration.loader` | `900ms` | CMP-027 목록 추가 로딩 표시의 한 주기(세 칸이 300ms씩 차례로 켜짐) |
| `motion.duration.count` | `400ms` | F12 누적 수 다이얼 롤 전용. `memory − count` 시점에 시작해 기억 조각 형성과 함께 멈춤 |
| `motion.duration.type` | `35ms` / 글자 | F01 대화창 문장 표시 전용(코드 상수). 문장당 약 1~1.5초 |
| `motion.duration.glow` | `3000ms` (밝아짐·어두워짐 각 1500ms) | F02 기억 조각 발광 호흡 전용 |
| `motion.easing.pixel` | `steps(2, end)` | 작은 픽셀 상태 변화 |
| `motion.easing.settle` | `cubic-bezier(0.2, 0, 0, 1)` | 화면 진입·상태 전환·장면의 감속 |

- 일반 버튼·IconButton의 Pressed는 즉시 오른쪽 아래로 2px 이동하며 Primary의 하단 단차를 2px로 줄입니다. 밑줄 텍스트 행동(`ghost`, `danger-text`)은 가로 이동·배경 채움 없이 아래로 2px 눌립니다. MemoryRow·맨 위로 버튼은 이동 없이 면이 `bg.scene.raised`로 바뀝니다. Reduced Motion에서는 이동이 0px입니다.
- 화면 본문 `.arca-shell__content`가 mount될 때 opacity 0→1로 `motion.duration.base` 한 번 진입합니다. 위치·배율 변화와 퇴장 연출 없이 라우트와 포커스는 즉시 전환합니다. 입력·일반 rerender는 재생하지 않으며, 이전·다음 화면을 겹치는 crossfade는 사용하지 않습니다. Dialog·Sheet는 모션 없이 열리고 닫힙니다.
- 화면의 한 부분만 먼저 튀어나오지 않게 합니다. 루트 탭은 탭이 없던 화면(F03·F12·F21 등)에서 들어올 때만 본문과 같은 fade로 나타나고, 루트 탭 화면 사이에서는 그대로 남습니다. F10 캡슐 배경은 이미지가 준비된 순간 같은 fade로 나타나며 본문 진입을 기다리게 하지 않습니다.
- 처리 중 문구·보조 행동은 지연 표시(04 §5.5)를 따라, 빠른 요청이 끝나 화면이 바뀌기 직전에 문구·버튼이 번쩍이거나 배치가 밀리지 않게 합니다.
- 맨 위로 이동(CMP-026, 현재 루트 탭 다시 누르기)은 smooth 스크롤이며 Reduced Motion에서는 즉시 이동합니다.
- 무한 반복, 자동 깜빡임, 시차 배경과 읽기 뒤의 움직이는 별가루를 사용하지 않습니다. 예외는 F02 기억 조각 발광과, 요청이 진행되는 동안에만 보이는 CMP-027 목록 로딩 표시입니다. 로딩 표시는 8px 픽셀 세 칸이 `signal.step-2`에서 `color.signal`로 `motion.duration.loader` 주기·`steps`로 차례로 켜지며 요청이 끝나면 사라지고, Reduced Motion에서는 세 칸 모두 `signal.step-1`로 켜진 정지 상태입니다. 기억 조각 발광은 조각 둘레의 픽셀 빛 3겹만 `motion.duration.glow` 주기·`steps(6)`로 밝아지고 어두워지며, 조각 자체·텍스트·조작은 움직이지 않습니다.
- 로딩 Placeholder에는 shimmer를 사용하지 않습니다.
- 한 장면에서 동시에 움직이는 핵심 대상은 하나로 제한합니다. F01에서는 대화창 문장 표시가 그 대상이며 장면 이미지는 정지합니다. 장면이 바뀔 때만 다음 장면이 이전 장면 위로 `motion.duration.scene`·`steps(4)`로 겹쳐 나타나고, 새 장면의 첫 문장은 그 뒤에 표시를 시작합니다. 마지막 문장 뒤 진행하면 대화창이 `motion.duration.scene`·`motion.easing.settle`로 사라진 뒤 탑승 Primary가 같은 값으로 나타납니다. 탑승 Primary를 누르면 인트로 전체가 `motion.duration.depart`·`steps(8)`로 바탕색(`color.bg.canvas`)에 가라앉은 뒤 F02가 같은 색 위에서 열리며, 그동안 추가 입력은 받지 않습니다. Reduced Motion에서는 모두 즉시 전환합니다.
- F01 문장 표시는 무한 반복이 아니라 조작마다 한 번 끝나는 연출입니다. 탭·Enter·Space·진행 조작으로 즉시 완성하고, 표시 중에도 건너뛰기를 막지 않습니다. 커서 깜빡임은 사용하지 않습니다. 문장의 줄바꿈 위치는 표시 시작부터 완성까지 고정되며(글자 단위 가시성만 전환), 새 문장은 빈 상태에서 시작합니다.

### 7.2 Reduced Motion

`prefers-reduced-motion: reduce`에서는 장식성 duration을 0ms로 바꾸고 transform 이동과 단계 애니메이션을 제거합니다. 상태 변화, 포커스와 콘텐츠 자체는 숨기지 않습니다.

- 인트로는 정지 장면과 완성된 문장을 즉시 제공하고 글자 단위 표시를 생략합니다.
- F02 기억 조각 발광은 반복을 멈추고 빛이 켜진 정지 상태로 표시합니다.
- 질문 전환은 새 질문을 즉시 교체하고 포커스·상태를 유지합니다.
- F10→F11의 공간 연결은 이동 없이 같은 정보·입력 가능 상태로 즉시 전환합니다. 모션이 입력 시작이나 라우트 포커스를 지연시키지 않습니다.
- 기억 조각은 형성 과정과 누적 수 롤을 생략하고 완료 정지화면과 새 누적 수를 즉시 표시합니다.
- CMP-027 로딩 표시는 켜진 정지 상태, 맨 위로 이동은 즉시 스크롤입니다.
- 성공·오류 의미는 모션 없이도 아이콘과 문구로 동일하게 전달합니다.
- 버튼 활성·비활성 fade는 0ms로 즉시 바뀝니다.

### 7.3 기억 조각과 햅틱

`CMP-024 MemoryFormation`은 최초 저장 성공에만 실행합니다([Rules AN-06 · L71](../../docs/ARCA_MVP_RULES.md#4-응답과-기억-조각)). 표현 목표는 **내가 남긴 말이 보존되는 연결감**입니다([D-UI-038 · L95](./DECISIONS.md#6-시각-표현과-탐색)).

- F10 캡슐 디스플레이 → F11의 조용한 질문 서문과 입력 → F12의 기억 조각·완료 결과로 연결합니다. 라우트 사이 오브젝트를 이동시키지 않으며, F12의 기억 조각(`MemoryFragment`, 면을 깎은 Violet 결정 조각, 4px/셀)이 `steps(4)`·`motion.duration.memory`로 한 번 밝아집니다. 완료 heading·누적 수·행동은 첫 프레임부터 DOM에 있어 형성이 결과를 가리지 않습니다. 저장한 응답은 F12에 다시 보이지 않고 F21에서 읽으며, 05가 저장 정본 확인을 소유합니다([D-UI-058 · L120](./DECISIONS.md#8-핵심-경험과-화면별-위계), [Rules AR-09 · L90](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)).
- 확인된 누적 수는 이전 수(N−1)에서 새 수(N)로 자물쇠 다이얼처럼 바뀐 자리만 아래에서 위로 한 칸 굴러 바뀝니다(9→10처럼 자리가 늘면 새 자리도 빈칸에서 굴러 나옴). `motion.duration.count`·`motion.easing.settle`로 형성의 마지막 단계와 함께 멈춰 제품 상한 2초 안에 끝나며, 스크린 리더에는 새 수만 제공합니다.
- Violet 픽셀의 개수·4단계 형성·결정 실루엣은 고정 계약이 아닙니다. 기억 조각의 형태·빛·움직임은 탐색 가능한 표현이고 채택본을 에셋 원본(AST-006)으로 기록합니다.
- 감정·작성 길이에 따른 등급·희귀도·보상 차이를 만들지 않습니다. 실제 사용자 본문을 연출 에셋이나 외부 생성 도구에 전달하지 않습니다.
- 서버 저장 성공 뒤에만 시작하고 최대 2초 안에 완료 정지화면·성공 문구·누적 수를 제공합니다. 성공 여부를 연출 재생 완료에 의존시키지 않습니다.
- 두 이동 행동은 진입 즉시 조작할 수 있으며 형성 완료를 기다리지 않습니다. Reduced Motion은 형성·누적 수 롤 없이 완료 정지화면으로 표시하고 스크린 리더에는 완료 결과만 한 번 알립니다.

서버 저장 성공을 확인한 뒤 공식 SDK의 `softMedium` 햅틱을 한 번만 호출합니다. 호출 실패·미지원·시스템 설정으로 인한 무반응은 저장 성공과 화면 전이를 막지 않습니다. 수정 저장, 목록 진입, 단순 버튼 조작에는 재사용하지 않습니다(D-UI-030).

## 8. 픽셀아트·아이콘·에셋

### 8.1 장면 래스터 규격

[D-UI-040 · L97](./DECISIONS.md#6-시각-표현과-탐색)에 따라 정수 배율을 유지하면서 장면마다 구도를 설계합니다.

| 항목 | 기준 |
|---|---|
| 원본 크기 | 장면·레이어별 결정. 전체 화면 장면(F01 AST-004, F10 AST-012)은 156×156 셀 정사각 |
| 표시 배율 | 코드 장면·도메인 표식은 1 source px = 4 CSS px(아이콘·작은 표식 2px, F02 발광 8px), 전체 화면 장면은 아래 화면별 정수 배율 |
| 구도 | 공유 배경과 핵심 전경 분리, 장면별 기준 위치·허용 crop 명시 |
| 안전 영역 | viewport가 아닌 gutter·panel padding을 제외한 실제 장면 컨테이너에서 검증 |
| 원본 | 전체 화면 장면은 생성 이미지를 156 격자로 양자화한 격자 PNG(로컬 작업물); 아이콘·JOY·기억 조각·빈 상태·인트로 fallback은 `src/ui/pixel/`의 격자 문자열 |
| 운영 export | 전체 화면 장면은 `design/assets/AST-*/export/`의 156×156 lossless WebP(필요 시 alpha); 격자 문자열은 코드 생성 SVG rect(`shape-rendering: crispEdges`) |
| 보간 | `image-rendering: pixelated`, smooth interpolation 금지 |
| 정적 장면 상한 | 파일당 150KB |
| sprite·모션 상한 | 파일당 500KB |
| 초기 eager 이미지 | 모든 레이어·poster를 합산해 300KB 이하 |

- 작은 화면에서 무조건 중앙을 남기는 방식 대신 핵심 전경의 기준 위치를 정수 좌표로 재배치합니다. 비정수 축소로 화면에 맞추지 않습니다.
- 레이어 분리는 구도를 위한 것이며 움직이는 시차 배경을 허용하는 근거가 아닙니다. 핵심 오브젝트·텍스트 여백을 container별로 보존합니다.
- 초기 화면의 최소 자원만 eager로 불러오고 이후 장면은 지연 로딩합니다(F01은 장면 1을 즉시, 2~6을 유휴 시점에 prefetch). 장면의 실제 텍스트·입력·저장 완료는 poster/font/motion 로딩 완료를 기다리지 않습니다. 컨테이너 영역을 먼저 확보해 자원 도착이 커서·버튼을 밀지 않게 하며 실패는 장식의 정적 fallback으로 격리합니다(F01 장면 이미지 실패 시 해당 코드 장면, F10 캡슐 배경 실패 시 배경 없음). 로딩 경계와 성능 증거는 [06 §10.5 · L643–651](./06_FRONTEND_SPEC.md#105-시각-자원-로딩과-실패-격리)를 따릅니다.
- 핵심 서사·상태 문구는 실제 텍스트로 제공합니다. 큰 글자에서 장면이 텍스트를 가리거나 레이아웃 높이를 잠그지 않습니다.
- 화면 전체를 덮는 배경 장면(F01)은 한 원본에 세로 폰용 핵심 안전 띠와 넓은 화면용 좌우 확장 영역을 둡니다. 셀당 px는 `max(ceil(폭/156), min(floor(폭/90), floor(높이/110)))`로, 폭을 덮는 정수 이상에서 가로 약 90칸이 보이게 하되 가로가 긴 화면에서는 세로 110칸 이상이 보이도록 낮춥니다. CSS `round()` 미지원 엔진은 비정수 cover로 대체합니다. 가로는 가운데로 정렬합니다. 장면이 화면보다 짧으면 세로 가운데에 두고 위·아래 가장자리를 평면 색 계단으로 어둡게 해 바탕색과 잇습니다. 화면보다 길면 위쪽 기준으로 두어 넘치는 아래·좌우만 잘립니다. 확장 영역은 배경의 연장만 두고 의미를 가진 사물을 두지 않습니다. 격자·안전 띠 좌표는 Asset Manifest에 기록합니다.
- F01 장면 6(캡슐 안 1인칭)은 셀당 `ceil(폭/156)` px로 원본 구도를 거의 다 보이고, 화면보다 짧으면 세로 가운데·길면 아래 기준으로 둡니다. 아래 가장자리 계단은 마지막 5행만 씁니다.
- F10 캡슐 배경은 156×156 원본을 셀당 `max(ceil(폭/156), round(높이/170))` px(390×844 기준 5px)로 화면 맨 위·가로 가운데에 두고 넘치는 좌우·아래만 자릅니다. 유리 자리는 투명이고 같은 격자의 코드 하늘 층을 뒤에 겹칩니다. 배경 층은 첫 화면 높이(100dvh)이며 본문과 함께 스크롤합니다. 그 안에서 이미지보다 긴 부분은 덮개 판 색(`bg.scene`)으로 잇습니다. 이미지 로딩 전·실패 시 배경을 그리지 않습니다(AST-012).
- 320px viewport 안의 실제 장면 폭, 기본 폭, 480px 콘텐츠 폭, 480px보다 넓은 화면(펼친 폴더블·태블릿)과 큰 글자에서 구도를 비교합니다. 핵심 의미가 잘리면 전경 배치나 대체 구도를 조정하고, 재배치할 수 없는 장식은 생략합니다.
- 각 채택본의 레이어·배율·기준 위치·허용 crop·정적 대체를 Asset Manifest와 기준 원본에 기록합니다.

### 8.2 아이콘 체계

일반 조작 아이콘은 `src/ui/pixel/icons.tsx`의 ARCA 자체 제작 12×12 격자 13종을 사용하며 외부 아이콘 팩을 포함하지 않습니다. JOY·SEMA·기억 조각의 도메인 의미는 ARCA가 소유합니다. 출처가 달라도 화면에서는 아래 문법을 통일합니다(D-TECH-053).

| 토큰·규칙 | 값 |
|---|---|
| 기준 제작 격자 | `12 × 12`, 2 CSS px/셀로 24px 표시 |
| `icon.size.default` | `24px` |
| `icon.size.emphasis` | `48px` |
| 색상 | `currentColor` |
| 일반 스타일 | outline을 기본으로 같은 픽셀 밀도·선 굵기·광학적 크기·상태 표현으로 통일 |
| 활성 상태 | 별도 게임형 badge가 아니라 배경·텍스트·테두리 토큰으로 표시(현재 루트 탭 아이콘은 `color.signal`) |

아이콘은 back·chevron-right·settings·today·archive·memory·edit·delete·copy·check·close·lock·to-top입니다. 원본·격자·채택 크기는 Asset Manifest AST-008에 기록합니다. 기억 조각·누적 수 표식은 아이콘이 아니라 `MemoryFragment`(2px/셀)를 사용합니다.

- 아이콘 font는 사용하지 않고 SVG 또는 React SVG 컴포넌트를 사용합니다.
- 외부 원본을 무조건 24px에 늘려 맞추지 않습니다. 정수 배율로 맞지 않으면 표시 박스 안의 여백 조정·격자에 맞춘 수정·다른 원본을 비교하고 채택 크기를 기록합니다.
- 의미가 같은 아이콘은 화면마다 다른 그림으로 바꾸지 않습니다.
- 주요 저장·삭제 행동은 아이콘만으로 표시하지 않습니다.
- 텍스트와 함께 있는 아이콘은 `aria-hidden="true"`로 처리합니다.
- 플랫폼이 직접 그리는 아이콘은 픽셀 아이콘으로 교체하거나 복제하지 않습니다.

### 8.3 도메인 시각 서명

| 개념 | 승인 방향·기본안 | 함께 표시할 정보 | 필수 제약 |
|---|---|---|---|
| JOY | Cyan을 중심으로 한 작은 기계 얼굴 또는 관측등 등 기억 가능한 시각적 인격 | 발신자 Label, 최초 1회 설명 | 감정 추정·친밀도·출석 압박·대화 기능으로 확장하지 않음 |
| SEMA | 미응답은 질문과 작성 행동이 먼저, 완료는 질문 서문 뒤 완료 문구와 상세 진입. F10은 캡슐 디스플레이 | 현재 또는 저장 당시 질문, 짧은 JOY Label·질문 위 KST 날짜 | 스캔선·진단 그래프·무한 파동 금지 |
| 응답 | 잉크색 RecordPanel 기본안, 본문 서체와 작은 시작 공간 | 입력·글자 수·비공개·기기 임시 보관·오류 | 감정 분석색·점수 금지, 서버 기록 저장과 구분 |
| 기억 조각 | 면을 깎은 작은 Violet 결정 조각(`MemoryFragment`), F02는 둘레 3겹 발광 | F10·F12의 저장 완료 문구·누적 수 | 희귀도·등급·보상 상자 금지 |
| 누적 수 | 작은 기억 조각 표식과 숫자 | 단순 누적 개수 | 진행률·연속 출석·순위 금지 |
| 항해 기록 | 흰 질문 중심의 한 열 MemoryRow와 실제 연월 구획 | 날짜 위·저장 당시 질문 일부 아래; 응답은 상세 | 인벤토리·수집 타일·AI 요약·미작성 기간 빈칸 금지 |

JOY의 얼굴·상징 형상은 탐색할 수 있지만 첫 비교안은 표정 변화 없는 작은 기계 얼굴 또는 관측등입니다. 상태 변화는 신호 도착·실제 저장 성공 등 확인 가능한 사건에만 연결합니다. 응답 내용이나 추정 감정에 반응하지 않으며 생성형 대화 기능을 추가하지 않습니다([D-UI-037 · L94](./DECISIONS.md#6-시각-표현과-탐색)).

에셋 파일은 Asset Manifest에서 `사용 승인` 상태가 된 것만 운영 빌드에 포함합니다. 생성형 이미지나 외부 리소스는 제작자·도구·원문 라이선스·상업 이용과 수정 가능 여부를 함께 기록합니다. 제작과 검증에는 합성 데이터를 사용합니다.

## 9. 공통 컴포넌트 인벤토리

### 9.1 전체 목록

| ID | 이름 | 역할 | 기반 요소·동작 경계 |
|---|---|---|---|
| CMP-001 | `PixelAppShell` | Navigation 아래 max-width·gutter·Safe Area·스크롤 문맥 | `main`과 공통 셸 |
| CMP-002 | `ScreenTitle` | 앱 콘텐츠 내부의 화면 제목·초기 포커스 대상 | `h1`, 화면당 하나 |
| CMP-003 | `PixelCanvas` | 전체 어두운 배경과 콘텐츠 정렬 | 비상호작용 layout |
| CMP-004 | `ScenePanel` | 인트로·SEMA·기억 완료의 어두운 장면 | 비상호작용 `section` |
| CMP-005 | `RecordPanel` | 입력·기록의 잉크색 기본안, 긴 문서의 light 문맥 | 비상호작용 `section` |
| CMP-006 | `InsetPanel` | 보조 설명·상태·그룹 | 부모 문맥에 따른 light/dark variant |
| CMP-007 | `PixelButton` | 텍스트가 있는 주·보조·위험 행동 | 네이티브 `button` 또는 의미에 맞는 `a` |
| CMP-008 | `PixelIconButton` | Back·Close·Settings 같은 보조 아이콘 행동 | 네이티브 `button`, 접근성 이름 필수 |
| CMP-009 | `PixelField` | Label·control·help·count·error 조합 | 시각 wrapper, 실제 Label 연결 |
| CMP-010 | `PixelTextField` | 닉네임 등 한 줄 입력 | 네이티브 `input` |
| CMP-011 | `PixelTextarea` | 1~2,000자 응답 작성·수정 | 네이티브 `textarea` |
| CMP-012 | `PixelCheckboxRow` | 필수 약관 한 항목의 동의와 전문 열람 | 네이티브 checkbox, Label 안의 밑줄 약관 이름 button(Label 요소 밖 형제) |
| CMP-013 | `SemaSignalPanel` | 현재 질문 우선, 짧은 JOY Label·패널 상단 날짜. F10은 캡슐 배경 위 디스플레이(`CapsuleDisplay`) | ScenePanel·CapsuleDisplay 기반 domain composition |
| CMP-014 | `QuestionSwitchAction` | 기본·대체 질문의 명시적 전환 | PixelButton secondary 또는 text action |
| CMP-015 | `MemoryRow` | 날짜 caption 위·질문 일부 아래의 목록 항목; 응답은 상세 | 하나의 link·button hit area |
| CMP-016 | `MemoryCount` | 루트 제목 오른쪽의 기록편 아이콘과 `{n}개` | 접근성 이름 `기억 조각 {n}개`, 진행률 역할 금지 |
| CMP-017 | `PixelAlertDialog` | 비가역·파괴 행동 확인 | headless modal 동작, ARCA 시각 |
| CMP-018 | `PixelSheet` | 문맥 선택·설명·복사 등 보조 흐름 | headless modal 동작, swipe만으로 닫지 않음 |
| CMP-019 | `PixelToast` | 행동 없는 일시적 성공·정보 | non-modal status, blocking Overlay 위 금지 |
| CMP-020 | `InlineStatus` | 입력·저장·추가 로딩 가까이의 상태·재시도 | `status` 또는 필요 시 `alert` |
| CMP-021 | `PixelPlaceholder` | shimmer 없는 정적 로딩 윤곽 | 장식은 숨기고 별도 상태 전달 |
| CMP-022 | `StatePanel` | 빈 상태·전체 오류·오프라인의 제목·설명·행동 | InsetPanel 기반 composition |
| CMP-023 | `PixelIcon` | 승인된 일반·도메인 SVG 표시 | 자체 상호작용 없음 |
| CMP-024 | `MemoryFormation` | 최초 저장 성공 형성·완료 정지화면 | CSS 단계 애니메이션 |
| CMP-025 | `RootFloatingTabs` | F10·F20·F30 루트 이동. 현재 탭을 다시 누르면 맨 위로 스크롤 | 공식 플로팅 탭 외곽 규격 adapter |
| CMP-026 | `ScrollTopButton` | F20 목록을 한 화면 높이 넘게 내렸을 때 맨 위로 이동. 루트 탭 16px 위, 탭 오른쪽 끝에 맞춤 | 네이티브 `button`, 접근성 이름 필수, 44px 타깃, 숨김 동안 조작·접근성 트리에서 제외 |
| CMP-027 | `PixelLoader` | 이미 보이는 목록 아래 다음 항목을 불러오는 동안의 작은 표시 | 장식은 숨기고 상태는 live region으로 전달 |

CMP의 이름·의미·상태·접근성은 출처와 무관하게 유지합니다. 구현 후보 매핑과 채택 기록은 [06 §2.4 · L97–122](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적)를 참조하며, 외부 라이브러리 이름을 새 제품 CMP로 추가하지 않습니다.

범용 `Card`는 만들지 않습니다. 화면은 의미에 따라 ScenePanel, RecordPanel, InsetPanel 중 하나를 선택합니다([D-UI-018 · L46](./DECISIONS.md#3-design-system-결정)).

### 9.2 Surface 계약

| 컴포넌트 | 배경·본문 문맥 | 기본 padding | 장식 기본안 |
|---|---|---:|---|
| CMP-003 PixelCanvas | canvas / on-dark | layout gutter | 장식 없음 |
| CMP-004 ScenePanel | scene / on-dark | 24px | plain 2셀 계단 |
| CMP-005 RecordPanel | record / on-dark, 문서용 document / on-light | 20px, F21 응답(hero) 24px | plain 2셀 계단 |
| CMP-006 InsetPanel | inset-light 또는 inset-dark | 16px 세로·20px 가로 | plain 1셀 계단 |

- F11·F22의 입력 바깥 RecordPanel과 F12의 ScenePanel은 배경·padding을 제거해 중첩 면을 줄입니다. 입력 경계는 유지합니다.
- F11·F22의 질문 ScenePanel과 F10 완료·F21의 질문 서문(`arca-preface`)은 면 없이 왼쪽 1셀 `signal.step-2` 선과 16px 들여쓰기로 표시합니다.
- F10 캡슐 디스플레이(`CapsuleDisplay`)는 `color.capsule.display.fill`·`color.capsule.display.line`의 outlined 프레임이며 padding은 24px 세로·20px 가로(360px 미만 20px·16px)입니다.
- Surface의 의미와 light/dark 문맥, 장식 강도 plain/outlined를 구분합니다. 같은 위계의 surface를 반복 중첩하지 않습니다.
- 읽기·보조 영역은 border·shadow 없이 면과 여백으로 구분할 수 있습니다. 입력 control의 경계·포커스는 별도로 유지합니다.
- ScenePanel 안의 입력은 RecordPanel의 기록 문맥으로 분리하되 밝은 색이나 외곽선으로만 구분하도록 강제하지 않습니다.
- RecordPanel의 본문 뒤에 장면 픽셀아트나 별가루를 깔지 않습니다.

### 9.3 Button 계약

| 항목 | 계약 |
|---|---|
| Variant | `primary`, `secondary`, `danger`, `ghost`, `danger-text`, `row` |
| 높이 | 최소 52px, IconButton은 44×44px |
| Padding·gap | inline 20px, icon gap 8px |
| Primary | 화면당 최대 하나, `color.brand.primary` 채움, `color.brand.edge` 2px 선, `color.brand.primary.deep`의 흐림 없는 1셀(4px) 하단 단차 |
| Pressed | 즉시 오른쪽 아래 2px 이동, Primary 단차 2px로 축소 |
| Hover | fine pointer 환경에서만 secondary·row의 선, ghost의 글자를 `text.on-dark.primary`로 밝힘, glow 없음 |
| Focus | `color.signal` 2px focus ring과 2px offset. F01 탑승 Primary가 터치 진행으로 포커스를 받은 경우만 ring 생략(`data-quiet-focus`) |
| Disabled | 네이티브 `disabled`: `bg.inset-dark` 채움·`border.subtle` 선·보조색 글자·단차 제거·`not-allowed` cursor. 포커스를 유지해야 하는 주 행동(F02 동의 전, F03 오류 중)은 `aria-disabled`로 실행만 막고 Primary는 `brand.primary.deep` 채움·`border.on-dark` 선·보조색 글자 |
| Loading | 크기와 Label 영역 유지, `aria-busy`·`aria-disabled`, 중복 실행 금지, 왼쪽 아래 정적 픽셀 점 세 개(`opacity.decorative-muted`) |

밑줄 텍스트 행동은 `ghost`(보조색 글자: 질문 전환 `다른 질문 보기`·`처음 질문 보기`, 건너뛰기, 다시 시도, 복사, 버리기 등)와 `danger-text`(Danger 글자: F21 `삭제하기`)입니다. 배경 채움 없이 2px 두께·4px offset 밑줄과 2px 아래 눌림만 사용하며 44px 이상 타깃과 focus-visible 링을 유지합니다. 약관 이름처럼 문장 안의 링크형 button(`arca-inline-link`)은 흰 글자 밑줄이며 눌리면 보조색으로 바뀝니다.

위험 행동을 Primary 색으로 위장하지 않습니다. 삭제의 정확한 확인 단계와 문구는 `04`, 실행 결과와 API 오류는 `05`가 소유합니다.

Primary가 없는 읽기 화면도 정상입니다. F21의 수정·삭제는 보조 역할을 사용하고, F13의 날짜 변경 직후 복사는 주 복구 행동으로 강조합니다. F12의 Primary는 첫 조작 가능 시 확인한 수로 03의 역할을 정하고 같은 방문 동안 위치·이름·강조를 유지합니다. 늦은 누적 수 조회는 정보만 갱신하며 정확한 고정 시점은 04 IX-039를 따릅니다([D-UI-061·D-UI-063·D-UI-066 · L123–127](./DECISIONS.md#8-핵심-경험과-화면별-위계)).

### 9.4 Field 계약

CMP-009는 위에서 아래로 `Label → Control → Help·Draft status와 Count → Error` 순서를 유지합니다([D-UI-027 · L53](./DECISIONS.md#3-design-system-결정)).

| 상태 | 시각·의미 계약 |
|---|---|
| Default | 입력값은 본문 서체, surface에 맞는 on-dark/on-light 전경과 식별 가능한 2px control border |
| Hover | fine pointer에서 border만 한 단계 강조 |
| Focus | 선을 `text.on-dark.primary`로 밝히고 별도 `color.signal` focus ring, Label 유지, `color.signal` caret |
| Error | Danger 선·8px 사각 표식·문구, `aria-invalid=true`, error ID 연결 |
| Read-only | `bg.record` 채움, 값 선택·복사 허용, 수정 불가 설명, Disabled 색과 구분 |
| Disabled | 포커스·수정·제출 불가, native disabled 사용 |

- Placeholder는 예시일 뿐 Label이나 요구사항을 대신하지 않습니다.
- 응답은 1~2,000자, 닉네임은 정규화 후 보이는 문자 2~12자라는 제품 규칙을 표시·검증합니다. 정확한 계산과 오류 노출 시점은 `04`, 서버 계약은 `05`가 소유합니다.
- 글자 수는 IME 조합 중에도 현재 입력값의 EGC 수를 즉시 표시합니다. 검증·저장·임시 보관의 확정 시점과 분리하며 매 키 입력마다 live announcement를 만들지 않습니다(04 IX-001).
- 임시 저장 상태는 오류와 같은 위치를 경쟁하지 않도록 Help row에 표시합니다.
- 응답 입력 가까이에 짧은 비공개 설명을 제공합니다. 기기 임시 보관 성공과 서버 기록 저장 성공을 구분하며 실제 쓰기 성공을 확인하기 전에 보관 완료를 표시하지 않습니다. 실패 시 본문을 유지하고 미보관 상태를 알립니다. 정상 상태는 짧은 Label로 표시하며 짧은 보관 안내는 저장 행동 아래에 항상 표시합니다. 높은 오류와 함께 발생한 미보관 위험을 숨기지 않습니다. 정확한 문구와 설명 연결은 04 IX-037·§6.6이 소유합니다([D-UI-060 · L122](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- Textarea는 초기 4줄의 기본 공간에서 시작하고, 복원된 임시본·기존 긴 응답은 첫 표시부터 내용에 맞춰 확장합니다. 고정 px 상한 뒤 내부 스크롤로 전환하지 않습니다([D-UI-036 · L93](./DECISIONS.md#6-시각-표현과-탐색)).
- 키보드가 열린 실제 공간과 사용자 글자 크기를 기준으로 페이지를 스크롤하며 커서·오류·글자 수·저장 행동에 도달할 수 있어야 합니다. 1자·2,000자·한글 조합·붙여넣기·줄바꿈·큰 글자·키보드 열고 닫기에서 커서와 스크롤을 검증합니다.

### 9.5 약관 Checkbox 계약

- CMP-012는 네이티브 checkbox를 사용하고 시각적 24px 체크 상자와 실제 native input 44×44px 이상의 타깃을 제공합니다.
- Label은 `필수` + 밑줄 약관 이름 + `에 동의해요`로 한 줄에 둡니다. 약관 이름은 전문을 여는 button이며 선택 상태를 바꾸지 않고, 나머지 Label 텍스트는 선택을 바꿉니다. 약관 이름의 세로 타깃은 줄 배치를 바꾸지 않는 padding으로 44px를 확보하고 접근성 이름은 `… 전문 보기`입니다.
- `필수`는 본문 서체의 일반 텍스트이며 `color.brand.edge`(동의 면 위 6.7:1)를 사용합니다. `color.brand.primary`는 같은 면에서 2.4:1이라 텍스트에 쓰지 않습니다.
- 간격: 보이는 24px 체크 상자와 텍스트 사이 12px(44px 타깃의 투명 테두리 포함), `필수`와 약관 이름 사이 8px. 체크 상자·`필수`·약관 이름의 세로 중심을 맞춥니다.
- 서비스 이용약관과 개인정보처리방침 두 항목을 독립적으로 표시합니다.
- 두 필수 항목이 모두 선택되기 전 주 행동은 비활성화합니다.
- MVP에는 전체 동의, 선택 동의와 마케팅 동의를 만들지 않습니다([Rules ON-02~ON-03 · L35–36](../../docs/ARCA_MVP_RULES.md#2-최초-탑승과-승객)).
- 승객 생성 실패 뒤에도 선택 상태가 유지되어야 하며, 상태 소유와 복원은 `06`이 정의합니다.

### 9.6 질문·기억 계약

- CMP-013의 내부에서는 현재 질문이 메타보다 먼저 읽히며, F10 미응답·F11에서는 질문이 화면의 첫 콘텐츠입니다. F10은 질문 영역을 투명 캡슐 배경 위의 반투명 디스플레이에 둡니다. 미응답은 JOY Label 옆 오른쪽에 날짜를 보조색 caption으로 두고(좁은 폭·큰 글자에서 줄바꿈) 그 아래 title 크기 질문, 바로 뒤 작성·질문 전환 묶음을 둡니다. 완료는 라벨 없는 선택 질문 서문, 작은 기억 조각과 가운데 정렬 완료 문구, 상세 진입 Primary만 두며 응답 발췌는 표시하지 않습니다. 하단 발신자·날짜·SEMA 코드 목록은 두지 않으며 누적 수는 루트 제목 오른쪽(CMP-016)에 둡니다([D-UI-057·D-UI-062 · L119](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- CMP-014는 질문 아래에서 기본·대체 질문을 명시적으로 전환합니다. Segmented control, swipe, carousel과 추가 질문 무한 요청을 사용하지 않습니다([Rules SE-08 · L56](../../docs/ARCA_MVP_RULES.md#3-오늘의-sema)).
- CMP-015는 위에 날짜를 보조색 caption으로, 아래에 저장 당시 질문 일부를 흰 본문 서체로 표시하는 전체 너비 행입니다. `bg.record` 1셀 계단 면·20px padding·하단 2px `border.subtle` 선을 쓰고, 눌리면 `bg.scene.raised`로 바뀝니다. 응답 발췌·응답 Label·SEMA 코드는 시각 및 접근성 이름에서 제외하고 선택 후 F21에서 읽습니다. 한 열과 전체 행 hit area를 유지하고 인벤토리·수집 타일로 표현하지 않습니다([D-UI-039 · L96](./DECISIONS.md#6-시각-표현과-탐색)).
- 발췌의 원문·비공개·수정·삭제 규칙은 [Rules AR-01·AR-09 · L82–90](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)를 따르며 API/캐시의 비공개 발췌에 적용합니다. F10 완료는 발췌를 표시하지 않고 F20은 질문·날짜만 표시하며, 전문은 상세에서 제공합니다. 길이·줄바꿈·문구는 03·04, 발췌 필드·생략 여부·수정/삭제/날짜 변경 갱신 계약은 05, 캐시 동기화는 06에 연결합니다. 발췌를 위해 목록의 행마다 상세 API를 추가 호출하는 구조에 의존하지 않습니다.
- F20의 월 제목은 MemoryRow 바깥의 목록 그룹 heading으로 제공하고 행별 날짜·전체 행 hit area를 유지합니다. 실제 KST 작성 연월의 경계만 표시하며 페이지를 나눠 읽어도 같은 월 제목을 중복하지 않습니다. 빈 날·월을 만들지 않습니다([D-UI-064 · L125](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- F21은 질문 서문 안쪽 상단에 작성 날짜만 표시하고 그 아래 질문 전문을 둡니다. `작성일` 접두 문구 없이 F10과 같은 날짜 caption을 사용하며 응답 전문을 주 읽기 영역으로 둡니다. 수정 여부는 화면에 표시하지 않습니다. F22 수정 화면도 날짜 위·질문 아래 순서입니다. 질문을 접거나 말줄임하지 않으며, 본문 아래 수정·삭제는 읽기를 마친 뒤 선택하는 보조 행동입니다([D-UI-065~D-UI-066 · L126–127](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- CMP-016은 F10·F20 제목 오른쪽에 2px/셀 기억 조각 표식과 `{n}개`를 `color.memory` 픽셀 서체로 `bg.inset-dark` 1셀 계단 면 위에 보이고 `기억 조각 {n}개`로 읽힙니다. 좁은 폭·큰 글자에서는 제목 아래 줄로 내려갈 수 있습니다. `progressbar`, 등급과 streak 의미를 부여하지 않습니다(D-UI-094).

### 9.7 Overlay·상태 계약

| 컴포넌트 | 사용 조건 | 포커스·알림 | 사용하지 않는 조건 |
|---|---|---|---|
| CMP-017 PixelAlertDialog | 삭제·비가역 확인. 삭제 확인의 취소·삭제는 한 줄 두 버튼(왼쪽 안전 행동), 좁은 폭·큰 글자와 결과 미확인 행동은 세로. 가운데 고정, 20px padding, 제목 앞 Danger(삭제)·signal(일반) 표식. 일반 확인의 실행은 ghost | 안전한 행동에 초기 포커스, 종료 뒤 trigger 복귀 | 일반 성공·설명·단순 오류 |
| CMP-018 PixelSheet | 문맥 선택·설명·보조 행동. 화면 아래에 붙고 아래 선 없음, 24px padding + 하단 Safe Area | modal focus, 명시적 닫기와 Android Back | 파괴 행동의 최종 확인 |
| CMP-019 PixelToast | 행동 없는 일시적 성공·정보 | polite, 포커스를 이동하지 않음 | 재시도가 필요하거나 차단 Overlay가 열린 상태 |
| CMP-020 InlineStatus | 필드·버튼·목록 가까이의 상태·재시도 | 기본 polite, 차단 오류만 assertive | 화면 전체 시작 실패 |
| CMP-021 PixelPlaceholder | 초기·부분 데이터 대기 | 시각 윤곽은 aria-hidden, 상태는 별도 한 번 | shimmer·무한 애니메이션 |
| CMP-022 StatePanel | 기록 없음·전체 오류·오프라인 | 제목·설명·최대 하나의 복구 행동 | 정상 데이터 위를 가리는 modal |

동일 영역의 InlineStatus는 주 오류와 유실 위험·복사 필요성을 하나의 읽기·발표 단위로 결합할 수 있습니다. 복사 실패의 직접 선택 방법은 시각 UI와 접근성 모두에 제공합니다. 정확한 발생 조건, 유지 시간, 우선순위와 한국어 문구는 `04`가 소유합니다. 오류 종류와 복구 가능성은 `05`를 참조합니다.

### 9.8 루트 탭 계약

세 탭은 화면 아래 `max(16px, Safe Area)`에 고정된 `min(폭 − 32px, 480px)` 묶음 안에서 폭을 나눠 쓰고 큰 글자에서도 이름을 읽을 수 있게 합니다. 아이콘 옆에 이름이 들어가지 않으면 이름을 아이콘 아래로 내립니다. 불투명 canvas 하단 영역과 글자 크기에 맞춘 bottom 여유·scroll margin을 두어 마지막 기록·행동과 겹치지 않게 합니다. 목록의 `window.scrollY` 복원을 유지하기 위해 별도 중첩 스크롤 컨테이너를 만들지 않습니다.

- CMP-025는 F10·F20·F30에서만 표시하고 탭은 `오늘`, `기록`, `설정` 세 개로 고정합니다. F30 닉네임 편집 중에는 숨깁니다(D-UI-094).
- 앱인토스가 제공한 최신 플로팅 외곽 형태, 위치와 Safe Area 규격을 우선합니다.
- ARCA가 제어할 수 있는 내부 아이콘·Label에만 승인된 픽셀 아이콘과 Neo둥근모를 적용합니다.
- 상세·작성·인트로·전체 삭제·오류 화면에는 표시하지 않습니다.
- 현재 탭은 `aria-current="page"`와 `bg.inset-dark` 면·흰 Label·`color.signal` 아이콘으로 구분합니다. 색만으로 구분하지 않습니다.
- 플랫폼 Navigation을 대체하거나 그 위에 겹치지 않습니다.

## 10. 상태 적용 행렬

`필수`는 컴포넌트가 반드시 제공해야 하는 상태, `조건부`는 소비 화면의 제품 상태가 있을 때 사용하는 상태, `해당 없음`은 해당 컴포넌트에 만들지 않는 상태입니다.

| 컴포넌트 | Hover | Pressed | Focus | Disabled | Loading | Error | Read-only |
|---|---|---|---|---|---|---|---|
| CMP-007 PixelButton | 조건부 | 필수 | 필수 | 필수 | 조건부 | 해당 없음 | 해당 없음 |
| CMP-008 PixelIconButton | 조건부 | 필수 | 필수 | 조건부 | 해당 없음 | 해당 없음 | 해당 없음 |
| CMP-010 PixelTextField | 조건부 | 해당 없음 | 필수 | 조건부 | 해당 없음 | 필수 | 조건부 |
| CMP-011 PixelTextarea | 조건부 | 해당 없음 | 필수 | 조건부 | 해당 없음 | 필수 | 조건부 |
| CMP-012 PixelCheckboxRow | 조건부 | 필수 | 필수 | 조건부 | 해당 없음 | 조건부 | 해당 없음 |
| CMP-014 QuestionSwitchAction | 조건부 | 필수 | 필수 | 조건부 | 조건부 | 조건부 | 해당 없음 |
| CMP-015 MemoryRow | 조건부 | 필수 | 필수 | 해당 없음 | 해당 없음 | 해당 없음 | 해당 없음 |
| CMP-017 PixelAlertDialog | 해당 없음 | 해당 없음 | 내부 조작 필수 | 해당 없음 | 조건부 | 조건부 | 해당 없음 |
| CMP-018 PixelSheet | 해당 없음 | 해당 없음 | 내부 조작 필수 | 해당 없음 | 조건부 | 조건부 | 해당 없음 |

- Touch 환경에 Hover가 있다고 가정하지 않습니다.
- Loading과 Disabled를 같은 의미로 합치지 않습니다. Loading은 진행 중임을 알리고 중복 실행만 막습니다.
- Read-only는 값을 읽고 선택·복사할 수 있으며 Disabled보다 높은 텍스트 대비를 유지합니다.
- 오류를 Border 색만 바꾸는 방식으로 표현하지 않습니다.

## 11. 비동기·빈 상태·오류 조합

### 11.1 로딩

- 짧은 지연의 정확한 표시 threshold는 `04`가 정합니다.
- 최초 데이터 대기에는 콘텐츠 형태와 비슷한 CMP-021을 사용하되 shimmer를 재생하지 않습니다.
- 저장 중에는 CMP-007의 너비·높이와 Label 영역을 유지하고 `aria-busy`를 알립니다.
- 추가 페이지는 마지막 행 근처에 닿으면 자동으로 불러오며, 기존 MemoryRow를 유지하고 마지막 행 아래 CMP-027을 표시합니다. 실패하면 같은 자리에 CMP-020과 재시도 행동을 둡니다.
- 하나의 요청을 여러 live region에서 중복 발표하지 않습니다([D-UI-023 · L50](./DECISIONS.md#3-design-system-결정)).

F20의 보류한 최신 목록은 안내나 행동을 띄우지 않고, 사용자가 맨 위로 돌아오면(CMP-026 포함) 적용합니다. 자동 focus/scroll 없이 읽던 문맥을 보존하며 적용·폐기 조건은 04 IX-042가 소유합니다.

### 11.2 빈 상태와 오류

- 기록 없음은 CMP-022 안에 선택적인 장식 이미지, 제목, 설명과 오늘의 SEMA로 이동하는 하나의 행동을 둡니다([Rules AR-02 · L83](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)).
- 입력·저장·추가 목록 실패는 실패한 대상 가까이에 CMP-020과 재시도를 둡니다. 작성 내용과 이미 불러온 기록을 제거하지 않습니다.
- 앱 시작 전체 실패는 CMP-022를 사용하고 재시도와 앱인토스 고객센터 진입을 제공합니다. 화면별 배치는 `03`, 문구는 `04`가 정의합니다.
- 오프라인은 자동으로 파괴 행동을 재실행하지 않고 현재 콘텐츠·임시본을 유지합니다.
- 오류 식별 코드에 답변, 닉네임, 질문 원문과 익명 식별키 원문을 포함하지 않습니다.

## 12. 접근성 계약

### 12.1 공통 최소선

- 일반 텍스트 4.5:1, 큰 텍스트·비텍스트 3:1 이상의 대비
- 독립 조작 타깃 최소 44×44 CSS px
- 2px 이상, 인접 색상 대비 3:1 이상의 포커스 표시
- 200% 글자 확대와 320px 폭에서 정보·행동 손실 없는 reflow
- 색, 모션, 위치나 픽셀아트 하나만으로 상태를 전달하지 않음
- 질문 확인·전환, 응답 입력과 저장을 스크린 리더로 완료 가능

### 12.2 의미와 이름

- 화면당 하나의 CMP-002를 실제 `h1`으로 사용합니다. 장식 문구를 heading으로 오용하지 않습니다.
- 텍스트와 함께 있는 아이콘·도메인 픽셀아트는 장식으로 숨깁니다.
- CMP-008은 보이는 tooltip에 의존하지 않고 목적이 분명한 접근성 이름을 갖습니다.
- 주요 저장·삭제·동의 행동은 보이는 텍스트 Label을 포함합니다.
- 입력 Label, 도움말, 글자 수와 오류는 실제 control ID를 기준으로 연결합니다.
- 기억 조각 수는 숫자만 읽히지 않도록 의미 있는 전체 이름을 제공합니다.

### 12.3 포커스와 키보드

- 라우트가 바뀌면 CMP-002에 programmatic focus를 이동하되 사용자의 일반 탐색 중에는 임의로 포커스를 빼앗지 않습니다.
- Dialog·Sheet가 닫히면 이를 연 조작으로 포커스를 복귀합니다.
- 파괴적 Dialog의 초기 포커스는 삭제가 아닌 안전한 취소·닫기 행동에 둡니다.
- Sheet는 swipe만으로 닫지 않고 Button, Escape와 Android Back 경로를 제공합니다.
- 포커스 순서는 보이는 위→아래 정보 순서와 일치하며 양수 `tabindex`를 사용하지 않습니다.

### 12.4 상태 알림

- 일반 로딩, 임시 저장, 저장 성공과 복사 성공은 하나의 `aria-live="polite"` 영역에서 필요한 결과만 한 번 알립니다.
- 즉시 대응이 필요한 저장 불가·차단 오류만 `role="alert"` 또는 assertive를 사용합니다.
- 입력 글자 수, 애니메이션 프레임과 반복 retry 상태를 매 변화마다 발표하지 않습니다.
- Toast는 포커스를 가져가지 않으며 행동이 필요하면 Toast 대신 InlineStatus, Sheet 또는 Dialog를 사용합니다.

### 12.5 실제 환경 검증

자동 axe 검사만으로 완료하지 않습니다. 최소 320px·200% 글자 확대, iOS VoiceOver, Android TalkBack, 키보드 표시, Reduced Motion, Android Back과 실제 토스 QR 환경에서 Acceptance #26~#29를 검증합니다.

## 13. 디자인 원본과 개발 전달

### 13.1 비교 시안과 기준 원본

[01 §10 · L195–220](./01_UI_OVERVIEW.md#10-에셋과-디자인-원본)의 핵심 흐름 비교·시각 채택을 따릅니다([D-TECH-025 · L88](./DECISIONS.md#6-시각-표현과-탐색)). Figma와 코드 프로토타입을 모두 허용하고, 채택본마다 기준 원본 하나와 그 버전을 명시합니다.

- Figma를 원본으로 선택하면 사용자 소유 `ARCA / MVP` 파일에 Foundations, Components, Domains, Screens, QA를 구성합니다. 번호·구성은 작업 규모에 맞춰 조정할 수 있습니다.
- 코드를 원본으로 선택하면 저장소 경로·commit과 재현 방법을 기록합니다. 다른 도구의 화면은 파생본으로 연결하며 전체 Figma 복제를 요구하지 않습니다.
- 기준 원본에는 화면·CMP ID와 토큰을 연결합니다. 레이아웃의 시각 원본이 필드·행동·API 계약을 덮어쓰지 않습니다.
- 시각 채택 시 비교한 차이, 읽기·키보드·스크롤·Reduced Motion·실기기 검증과 남은 한계를 기록합니다.

### 13.2 컴포넌트 변경 규칙

- 의미·행동·접근성을 보존하는 시각 기본값 조정과 호환 variant 추가는 같은 CMP ID를 사용합니다. 비호환 필수 계약 변경은 새 ID와 대체 관계를 만듭니다.
- 운영 화면은 의미 기반 토큰과 컴포넌트를 사용합니다. 표현 실험은 별도 프로토타입에서 임시 값·컴포넌트로 시작할 수 있고 문서 선행 갱신을 요구하지 않습니다([D-TECH-024 · L87](./DECISIONS.md#6-시각-표현과-탐색)).
- 기본값을 채택할 때 토큰·컴포넌트·소유 명세와 검증 근거를 같은 변경에 반영합니다. 승인 방향을 바꾸면 새 DECISIONS ID와 대체 관계를 기록합니다.
- 외부 에셋·폰트·아이콘과 채택된 원본 변경은 Asset Manifest의 권리·버전·운영 승인 상태를 함께 갱신합니다.
- 공통 컴포넌트의 정확한 TypeScript props와 파일 경로는 06이 이 계약을 소비해 정의합니다.

### 13.3 남은 시각 채택 작업

기준 원본은 `src/ui/tokens.css`, `src/ui/styles/`, `src/ui/pixel/`, `design/assets/AST-*/export/`와 화면 JSX입니다. 합성 데이터 비교와 Chromium·WebKit 회귀 증거는 [08 §14.1](./08_QA_AND_INTEGRATION.md#141-2026-09-28-ui-정리와-ime-카운터-검증)에 연결합니다.

- 채택: 인트로 6장면(AST-004 생성 이미지, 코드 장면 fallback)·JOY 관측등·기억 조각·F10 캡슐 배경과 시간대 하늘(AST-012), 외부 UI/아이콘 팩 없는 통합, Neo둥근모·Pretendard 역할과 타입 세 크기, 질문·입력·내 문장 위계, 체크박스 44px·텍스트 행동·Reduced Motion.
- 브라우저 검증 완료: 합성 데이터의 목록→상세·수정/삭제, F10 완료·F12, 오류·빈 상태·확대 비교.
- 남음: 실제 iOS·Android 토스 WebView의 OS 키보드·IME·선택 핸들·Safe Area·VoiceOver/TalkBack, 실제 기기 장기 읽기와 성능.
- 남음: Asset Manifest의 기존 로고 출처·운영 사용 승인과 생성 이미지 약관 확인. 데모 UI 채택과 운영 출시 승인은 구분합니다.

키보드 공간 축소 에뮬레이션과 Chromium CDP composition은 OS 키보드 실기기 검증을 대신하지 않습니다.

## 14. 관련 계약과 후속 검증

화면별 CMP 조합은 [03 §3 · L103–123](./03_SCREENS_SPEC.md#3-화면-범위와-추적-지도), 동작·문구는 [04 §6 · L342–362](./04_INTERACTIONS_AND_COPY.md#6-화면별-상호작용-인벤토리), 선별 UI·스타일은 [06 §2.4 · L97–122](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적) 및 [06 §2.5 · L124–131](./06_FRONTEND_SPEC.md#25-공통-스타일과-의존성-경계)에서 찾습니다.

합성 입력은 [07 §3.5 · L61–76](./07_MOCK_SCENARIOS.md#35-합성-콘텐츠와-민감정보), 시각 채택·접근성 증거는 [08 §10 · L179–194](./08_QA_AND_INTEGRATION.md#10-성능-시각과-사용성) 및 [08 §7 · L126–138](./08_QA_AND_INTEGRATION.md#7-입력-접근성-플랫폼-검증)로 연결합니다. 이 문서의 §13.3이 채택 상태를 소유합니다.

## 15. 외부 의존성 근거

플랫폼·서체의 채택 근거로 참조하는 공식 출처입니다. 설치 버전·SDK export의 확인은 [06 §2 · L51–131](./06_FRONTEND_SPEC.md#2-실제-자료와-기술-기반)에서, 실제 파일·권리·고지는 Asset Manifest에서 관리합니다.

- [앱인토스 FAQ](https://developers-apps-in-toss.toss.im/guide/faq.md)·[UI/UX 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md): §1.2의 플랫폼 UI 경계
- [Neo둥근모 공식 저장소](https://github.com/neodgm/neodgm): §4의 서체 파일·라이선스
- [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard): §4의 본문 서체 파일·라이선스
- [Device.triggerHaptic](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/device/device.triggerhaptic.md): §7.3의 햅틱 capability
