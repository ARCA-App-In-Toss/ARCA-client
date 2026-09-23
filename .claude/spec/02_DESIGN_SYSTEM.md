# ARCA Design System

- 문서 버전: v1.7
- 최근 수정일: 2026년 9월 22일
- 상태: 확정
- 승인 주체: 제품 책임자
- 시각 검증: 새 방향·기본안 승인, 비교 시안·실기기 검증 및 시각 채택은 미완료
- 편집: 중복 인계·설명을 줄이고 작업별 참조 위치를 추가했습니다. 필수 계약은 유지합니다.

토큰·CMP·픽셀아트·모션·접근성의 원본입니다. 실제 에셋 권리·확보 상태는 [Asset Manifest · L1–11](../../design/assets/ASSET_MANIFEST.md)가 소유합니다.

### 최소 읽기 경로

현재 파일은 `.claude/spec/02_DESIGN_SYSTEM.md`입니다. 필요한 절부터 읽습니다. 경로·줄 힌트 사용법은 [00 §3 · L47–53](./00_INDEX.md#3-참조-방향과-중복-방지)을 따릅니다.

| 작업 | 읽을 위치 |
|---|---|
| 외부 UI 시각 통합 | [§1.4 · L50–57](#14-서로-다른-출처의-시각-통합) → [06 §2.4 · L97–117](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적) |
| 색·서체·간격·형태 | [§2 · L59–97](#2-토큰-문법과-테마-구조) → [§3 · L99–143](#3-색상-토큰)·[§4 · L145–187](#4-타이포그래피)·[§5 · L189–233](#5-간격크기레이아웃-토큰)·[§6 · L235–277](#6-형태테두리그림자레이어) |
| 모션·아이콘·에셋 | [§7 · L279–318](#7-모션과-햅틱) → [§8 · L320–381](#8-픽셀아트아이콘에셋) |
| 공통 컴포넌트 | [§9.1 · L385–417](#91-전체-목록) → 해당 CMP 절 → [§10 · L513–532](#10-상태-적용-행렬) |
| 비동기·접근성 | [§11 · L534–552](#11-비동기빈-상태오류-조합) → [§12 · L554–592](#12-접근성-계약) |
| 원본·시각 채택 상태 | [§13 · L594–629](#13-디자인-원본과-개발-전달) |

## 1. 시스템 목표와 적용 경계

### 1.1 목표

앱 소유 화면은 **고요한 픽셀 심우주 관측실**의 브랜드 문법을 사용합니다. 장면·아이콘·주요 행동에 픽셀 표현을, 읽기 영역에는 역할별 서체·면·여백을 적용합니다. 모든 글자와 surface에 같은 장식 강도를 적용하지 않습니다. 감정 곡선·금지 표현은 [01 §3 · L43–79](./01_UI_OVERVIEW.md#3-비주얼-방향)을 따릅니다. 화면당 Primary는 최대 하나이며 최초 저장 연출은 최대 2초입니다.

### 1.2 플랫폼과 앱 소유 UI

| 영역 | 소유자 | 규칙 |
|---|---|---|
| 화면 상단 Navigation | 앱인토스 플랫폼 | 최신 비게임 가이드를 그대로 따르며 ARCA 픽셀 스타일로 위장하지 않음 |
| 루트 화면의 플로팅 탭 외곽 형식 | 앱인토스 플랫폼 규격 | F10·F20에서만 사용하고 공식 형태를 우선함 |
| Navigation 아래 화면 전체 | ARCA | `CMP-001 PixelAppShell` 아래에서 역할별 서체와 장식 위계를 갖는 ARCA 시스템 적용 |
| 버튼·입력·목록·상태·Overlay | ARCA | 네이티브 의미와 ARCA 토큰·CMP 계약을 기준으로 외부 컴포넌트와 자체 구현 통합 |
| 복잡한 Dialog·Sheet 동작 | ARCA 시각, headless 동작 | headless primitive는 포커스·ARIA·Dismiss만 담당하고 스타일을 제공하지 않음 |

앱 소유 UI는 TDS Mobile 컴포넌트를 사용하지 않습니다. Navigation 아래에 공통 앱 헤더를 한 번 더 만들지 않으며, 필요한 제목은 콘텐츠 내부 `CMP-002 ScreenTitle`로 표시합니다([D-UI-017 · L46](./DECISIONS.md#3-design-system-결정)).

### 1.3 구현 책임 경계

- 네이티브 `button`, `a`, `input`, `textarea`, `input[type="checkbox"]`의 의미와 기본 상호작용을 보존합니다.
- headless primitive는 `CMP-017 PixelAlertDialog`와 `CMP-018 PixelSheet`의 portal, focus trap, 배경 격리, Escape·Dismiss와 포커스 복귀만 보강합니다.
- Pxlkit·Pixelact UI 등에서 필요한 컴포넌트·스타일을 선별하고 네이티브 구현·headless 동작과 함께 사용할 수 있습니다. 특정 라이브러리 하나로 제한하지 않으며 외부 theme도 아래 통합 기준에 맞춥니다(D-TECH-050~053).
- Tailwind 사용을 허용하며 Emotion은 필수 기반이 아닙니다. 패키지·편입 소스·버전·import·CSS 구성과 유지보수 기록은 [06 §2.4~§2.5 · L97–126](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적)가 소유합니다. 입력/Overlay 계약은 04와 [06 §10.1 · L580–590](./06_FRONTEND_SPEC.md#101-dialogsheet-wrapper)·§10.6을 따릅니다.

### 1.4 서로 다른 출처의 시각 통합

- 모든 채택 CMP는 같은 의미 기반 색·서체 역할·간격·형태·상태·모션 토큰을 사용합니다. 외부 기본값은 ARCA 토큰에 매핑하며 라이브러리별 팔레트·테마를 별도로 유지하지 않습니다.
- 계단형 모서리의 셀 크기, 테두리 두께와 단단한 그림자는 §2·§6을 기준으로 맞춥니다. 다른 구현 기법도 같은 픽셀 밀도·위계로 보이게 하며, 모든 면에 같은 장식 강도를 요구하지 않습니다.
- 기본·눌림·포커스·비활성·로딩·오류 상태를 함께 비교합니다. clip/mask와 그림자가 포커스 선·확대된 글자·조작 영역을 잘라서는 안 됩니다. 외부 모션은 §7의 사건·시간·Reduced Motion 기준을 적용합니다.
- 외부 픽셀 폰트·강제 대문자·아이콘 기본값을 그대로 적용하지 않고 §4의 Neo둥근모/시스템 본문 역할과 §8.2의 아이콘 규칙으로 연결합니다.
- 생성 배경과 UI는 같은 팔레트 역할·픽셀 밀도·명암·텍스트 안전 영역을 기준으로 비교합니다. 생성 지시와 납품 기준은 Asset Manifest에 연결하고, 출력물의 픽셀 선명도·정수 배율을 실제 표시 크기에서 확인합니다. 질문·응답·조작은 실제 DOM으로 유지합니다.
- 정적 셸·주요 행동·아이콘에서도 픽셀 정체성을 읽을 수 있어야 합니다. 배경 로딩 실패·Reduced Motion에서도 이 문법과 본문 가독성을 유지합니다. 시각 채택은 §13.3에서 추적합니다(D-TECH-053).

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
- ARCA MVP는 `arca-default` 조합 한 벌만 제공합니다. 질문·작성·저장은 낮은 명도의 연속성을 기본으로 하고, 긴 문서 등에 선택하는 밝은 surface도 같은 테마의 내용 문맥입니다([D-UI-033 · L91](./DECISIONS.md#6-시각-표현과-탐색)).
- 시스템 테마 자동 추종과 별도 다크 모드 변형은 제공하지 않습니다.

### 2.2 단위 원칙

- 글자 크기와 행간은 `rem`으로 구현해 사용자 글자 확대를 따릅니다.
- 레이아웃, 간격, 테두리와 아이콘 표시 크기는 CSS px을 사용합니다.
- 기본 레이아웃 셀은 4 CSS px입니다.
- 2px 값은 선 두께와 승인된 Pressed 위치·shadow 변화처럼 지정된 세부 표현에 사용합니다.
- 픽셀 정렬보다 200% 글자 확대, 320px reflow와 조작 가능성을 우선합니다.

### 2.3 이 문서의 결정 강도

[00 §7.1 · L141–161](./00_INDEX.md#71-결정-강도와-자율-탐색)의 분류를 다음과 같이 적용합니다. 이 문서의 `확정`은 방향과 필수 계약의 승인이며 시각 검증 완료를 뜻하지 않습니다.

| 강도 | 이 문서의 범위 | 적용 |
|---|---|---|
| 필수 계약 | 플랫폼 경계, 네이티브 의미·상태·접근성, 원문 발췌 규칙, 서버 성공 뒤 연출, 건너뛰기·최대 2초·Reduced Motion, 에셋 권리·용량 상한 | 프로토타입도 준수하며 제품 의미·데이터를 임의로 변경하지 않음 |
| 조정 가능한 기본값 | §3 색 값, §4 타입 크기·행간, §5 장식 간격·입력 초기 줄 수, §6 장식 강도, §7의 상한 이내 타이밍 | 승인 방향과 필수 대비·타깃·reflow를 만족하는 범위에서 자율 비교·조정 후 채택값 기록 |
| 권장 시작안·탐색 가능한 표현 | §7.3 기록편 형성, §8.1 장면 구도, §8.3 JOY 형상, 정보 묶음·배치·핵심 흐름의 공간 연결·조건부 저장 바 | 03의 검증할 결과를 보존하는 대안을 별도 프로토타입에서 비교하고 §13의 시각 채택으로 확정 |

역할별 서체, 낮은 명도 연속성, 화면 상태에 따른 질문·응답의 위계는 승인된 방향입니다. 미응답은 질문 우선, 완료 홈은 응답 발췌 중심, 상세는 질문 서문 뒤 응답의 읽기 집중을 따릅니다([D-UI-057·D-UI-062·D-UI-065 · L120–128](./DECISIONS.md#8-핵심-경험과-화면별-위계)). 필수 정보·행동·접근성을 유지하는 배치는 [00 §7.1 · L141–161](./00_INDEX.md#71-결정-강도와-자율-탐색)에 따라 비교하며, 승인 방향을 바꾸는 경우 새 결정을 기록합니다.

## 3. 색상 토큰

### 3.1 기반·경험 색상

| 토큰 | 값 | 용도 |
|---|---:|---|
| `color.bg.canvas` | `#071426` | 앱 셸과 깊은 우주 배경 |
| `color.bg.scene` | `#10233F` | ScenePanel과 장면 전경 surface |
| `color.bg.record` | `#182B3C` | 작성·기록의 잉크색 surface 기본안 |
| `color.bg.document` | `#F4F7FB` | 정책·장문 등에 선택하는 밝은 surface |
| `color.bg.inset-dark` | `#0C1B30` | 어두운 surface 안 보조 그룹 |
| `color.bg.inset-light` | `#E7EDF5` | 밝은 surface 안 보조 그룹 |
| `color.text.on-dark.primary` | `#F4F7FB` | 어두운 surface의 본문 |
| `color.text.on-dark.secondary` | `#AAB9CF` | 어두운 surface의 보조 정보 |
| `color.text.on-light.primary` | `#071426` | 밝은 surface의 본문 |
| `color.text.on-light.secondary` | `#425574` | 밝은 surface의 보조 정보 |
| `color.border.on-dark` | `#607795` | 어두운 문맥에서 식별이 필요한 조작 경계 |
| `color.border.on-light` | `#7890AD` | 밝은 문맥에서 식별이 필요한 조작 경계 |
| `color.brand.primary` | `#2457E6` | Primary 행동과 브랜드 식별 |
| `color.signal` | `#67E8F9` | JOY·SEMA 신호 |
| `color.memory` | `#9A78FF` | 기록편·저장 완료의 제한된 빛, 조형은 §7.3에서 탐색 |
| `color.warmth` | `#C98A3D` | 제한된 온기 강조, 기능 상태에 사용 금지 |

`color.signal`, `color.memory`, `color.warmth`는 각각 도메인 경험을 나타내며 Success, Warning, Danger의 대체색으로 사용하지 않습니다. 넓은 본문 배경이나 긴 본문 글자에도 사용하지 않습니다.

### 3.2 기능 상태 색상

| 의미 | 밝은 surface 전경 | 밝은 surface 배경 | 어두운 surface 전경 | 어두운 surface 배경 |
|---|---:|---:|---:|---:|
| Success | `#176B4D` | `#E7F7EF` | `#63D7A4` | `#123829` |
| Warning | `#8A5A00` | `#FFF4D6` | `#F2B84B` | `#3A2A10` |
| Danger | `#B4232D` | `#FDECEE` | `#FF7A82` | `#3F1D27` |
| Info | `#2457E6` | `#EEF3FF` | `#89A7FF` | `#172B5F` |

각 쌍은 전경과 배경 사이 일반 텍스트 대비가 4.5:1을 넘습니다. 상태는 색만으로 전달하지 않고 아이콘과 문구를 함께 사용합니다([D-UI-022 · L50](./DECISIONS.md#3-design-system-결정)).

### 3.3 대비 기준

| 대상 | 최소 기준 | 적용 예 |
|---|---:|---|
| 일반 텍스트 | 4.5:1 | 본문, Label, 버튼 문구, 오류 문구 |
| 큰 텍스트 | 3:1 | WCAG 큰 텍스트 조건을 만족하는 Display |
| 아이콘·테두리·포커스 | 3:1 | 조작 경계와 선택·포커스 상태 |

기존 밝은 조합의 기준은 `on-light primary / document` 17.19:1, `on-light secondary / document` 7.02:1, `border.on-light / document` 3.06:1입니다. 잉크색 record에는 on-dark 텍스트·상태·경계를 사용합니다. 2026년 9월 12일 토큰 계산 결과 `on-dark primary / record` 13.48:1, `on-dark secondary / record` 7.28:1, `border.on-dark / record` 3.15:1로 기준을 충족했습니다. 이는 불투명 토큰 쌍의 계산이며 시각 채택본·실제 WebView의 본문·커서·포커스·오류 검증은 별도로 수행합니다. 색을 조정해도 이 절의 필수 대비를 낮추지 않습니다.

## 4. 타이포그래피

### 4.1 서체

| 토큰 | 값 |
|---|---|
| `font.family.pixel` | `Neo둥근모 v1.601 Regular` |
| `font.family.body` | `system-ui, Apple SD Gothic Neo, sans-serif` |
| `font.family.fallback` | `system-ui, Apple SD Gothic Neo, sans-serif` |
| `font.weight.regular` | `400` |
| `font.letter-spacing.default` | `0` |

- 픽셀 역할의 공식 Regular WOFF2를 저장소에 self-host하고 외부 CDN에서 불러오지 않습니다. 본문 기본안은 시스템 서체이며 추가 폰트 다운로드를 요구하지 않습니다.
- 픽셀 서체에는 `font-synthesis: none`으로 Bold·Italic 합성을 막습니다. 본문도 기본 Regular를 사용합니다.
- 강조는 굵기 합성 대신 크기, 여백, 색상, 테두리와 문장 위계로 표현합니다.
- Neo둥근모에 없는 이모지·문자는 fallback 서체로 표시하며, 누락 글리프를 숨기지 않습니다.
- 폰트 파일과 SIL Open Font License 1.1·저작권 고지를 함께 보존합니다.

### 4.2 역할별 서체

[D-UI-032 · L90](./DECISIONS.md#6-시각-표현과-탐색)에 따라 아래 두 목소리를 구분합니다.

| 역할 | 서체 | 예 |
|---|---|---|
| 브랜드·JOY의 짧은 말·조작 | `font.family.pixel` | 짧은 인트로 문장, 화면 제목, 질문, Button·Label·날짜·SEMA 코드 |
| 사용자의 말·지속해서 읽는 본문 | `font.family.body` | 응답 입력·발췌·상세, 닉네임 입력값, 장문 설명·정책·오류 설명 |

같은 Field에서도 Label과 입력값의 역할을 구분할 수 있습니다. 두 서체의 크기·행간·기준선은 합성된 한글·영문·숫자·이모지·장문으로 비교하고 실제 iOS·Android에서 채택합니다.

### 4.3 타입 스케일

| 토큰 | CSS 크기 | 행간 | 용도 |
|---|---:|---:|---|
| `type.display` | `2rem` / 32px 기준 | `2.75rem` / 44px 기준 | 인트로의 짧은 핵심 문장 |
| `type.screen-title` | `1.5rem` / 24px 기준 | `2.25rem` / 36px 기준 | 콘텐츠 내부 화면 제목 |
| `type.question` | `1.25rem` / 20px 기준 | `2rem` / 32px 기준 | 오늘의 질문과 저장 당시 질문 |
| `type.body` | `1rem` / 16px 기준 | `1.75rem` / 28px 기준 | 본문, 입력, 설명 |
| `type.control` | `1rem` / 16px 기준 | `1.5rem` / 24px 기준 | Button, Label, 상태, 날짜·코드 |

- `html` 글자 크기를 px로 잠그지 않고 브라우저 기본 100%를 유지합니다.
- 질문과 응답 전문은 한 줄 말줄임을 사용하지 않습니다. CMP-015의 원문 발췌는 전문이 아닌 미리보기로 구분하고 일부 생략을 허용합니다. 표시 길이·줄바꿈·정확한 안내 문구는 03·04가 [Rules AR-09 · L91](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)를 소비해 정의합니다.
- 날짜·SEMA 코드·누적 개수는 `type.control`을 사용하고 고정 폭 정렬을 위해 문자 폭을 추정하지 않습니다.
- 200% 글자 확대에서 Button label과 Metadata는 줄바꿈할 수 있으며 잘리거나 겹치지 않아야 합니다.

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
| `layout.textarea-initial-lines` | `3` | 초기 3~4줄 범위의 기본안, 현재 본문 행간으로 계산 |

- 레이아웃은 항상 한 열이며 화면 폭 증가로 2열 카드·타일로 바꾸지 않습니다.
- 주 스크롤은 세로 문서 흐름으로 두고 페이지 가로 스크롤은 금지합니다. Textarea는 내용에 맞춰 페이지 안에서 확장하며 고정 px 상한 뒤 내부 스크롤로 전환하지 않습니다.
- 480px보다 넓은 WebView에서도 배경은 전체를 채우고 콘텐츠만 최대 폭으로 제한합니다.
- 버튼 그룹은 기본적으로 세로로 쌓습니다. 같은 위계의 짧은 보조 행동만 320px·200% 글자 확대 검증을 통과할 때 가로 배치할 수 있습니다.
- 고정 행동 또는 루트 탭이 있다면 콘텐츠 끝에 동일한 높이와 Safe Area를 포함한 여유 공간을 확보합니다.
- F11·F22의 저장은 inline을 기본으로 하되 첫 작성 slice부터 긴 글 편집의 조건부 저장 바를 실기기 비교합니다. 가능하면 동일 button DOM node의 배치만 바꾸고 운영 채택은 검증 뒤입니다. 바와 inline은 같은 저장 행동이며 한 벌만 노출·조작·포커스 가능합니다. 본문·커서·오류를 가리면 inline으로 복귀하고, 모드 변경이 입력·스크롤·포커스를 잃게 하지 않습니다. 조건과 채택 기준은 [03 F11 · L373–433](./03_SCREENS_SPEC.md#52-f11--응답-작성)·Acceptance #37을 따릅니다([D-UI-059 · L122](./DECISIONS.md#8-핵심-경험과-화면별-위계)).

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
| `corner.control` | `4px` | Button, Checkbox, 작은 상태 |
| `corner.panel` | `8px` | RecordPanel, InsetPanel, Toast |
| `corner.scene` | `12px` | ScenePanel, Dialog, Sheet |
| `border.default` | `2px` | 경계 식별이 필요한 조작 요소·outlined surface |
| `border.none` | `0` | 읽기·보조 영역의 테두리 없는 면 |
| `corner.none` | `0` | 별도 모서리 장식이 없는 읽기·보조 영역 |
| `focus.width` | `2px` | 키보드 포커스 선 |
| `focus.offset` | `2px` | 외곽선과 컴포넌트 사이 간격 |
| `shadow.raised` | `4px 4px 0` | Primary와 선택된 raised surface에만 사용 |
| `shadow.pressed` | `2px 2px 0` | Pressed 상태 |

주요 행동·도메인 장면·outlined surface의 모서리는 1~3셀을 직각으로 잘라낸 계단형 실루엣을 기본으로 합니다. 읽기·보조 영역은 `plain` 표현으로 외곽선·모서리 장식을 생략하고 면·여백으로 구분할 수 있습니다. 비상호작용 면마다 테두리를 요구하지 않습니다([D-UI-034 · L92](./DECISIONS.md#6-시각-표현과-탐색)). 입력 경계·포커스·선택 상태는 독립적으로 식별 가능해야 하며 구현 기법은 `06`이 정합니다.

Blur shadow, backdrop blur, glass surface, 연속 gradient glow와 hover 발광은 사용하지 않습니다. 제한된 신호·기억 장면의 발광은 불투명 픽셀 블록의 단계적 명도 차이로 표현합니다.

### 6.2 투명도

| 토큰 | 값 | 제한 |
|---|---:|---|
| `opacity.decorative-muted` | `0.72` | 정보가 아닌 장식에만 사용 |
| `opacity.disabled` | `0.48` | Disabled 의미를 Label·cursor·상태와 함께 전달 |
| `opacity.dimmer` | `0.72` | `rgba(3, 8, 18, 0.72)`에만 사용 |

본문이나 오류 문구를 opacity만 낮춰 보조색으로 만들지 않습니다. Disabled도 opacity만으로 구분하지 않고 shadow 제거, cursor와 네이티브 `disabled` 속성을 함께 적용합니다.

### 6.3 레이어

| 토큰 | 값 | 대상 |
|---|---:|---|
| `layer.content` | `0` | 기본 문서 흐름 |
| `layer.raised` | `10` | raised surface와 장식 |
| `layer.app-sticky` | `20` | 앱 내부 고정 행동 |
| `layer.sheet` | `30` | Dimmer와 PixelSheet |
| `layer.dialog` | `40` | PixelAlertDialog |
| `layer.toast` | `50` | 차단 Overlay가 없을 때의 Toast |

플랫폼 Navigation과 공식 플로팅 탭은 이 앱 내부 숫자로 덮으려 하지 않습니다. 차단형 Overlay가 열린 동안 새 Toast는 화면에 중첩하지 않고 Overlay가 닫힌 뒤 전달하거나 해당 Overlay 안의 상태로 흡수합니다.

## 7. 모션과 햅틱

### 7.1 모션 토큰

| 토큰 | 값 | 용도 |
|---|---:|---|
| `motion.duration.instant` | `0ms` | Pressed 위치·shadow 변화 |
| `motion.duration.fast` | `120ms` | 작은 상태·아이콘 변화 |
| `motion.duration.base` | `180ms` | Dialog·Sheet·Toast 진입과 이탈 |
| `motion.duration.scene` | `320ms` | 질문·장면 전환 |
| `motion.duration.memory` | 최대 `2000ms` | 최초 저장 기억 조각 형성 전용 |
| `motion.easing.pixel` | `steps(2, end)` | 작은 픽셀 상태 변화 |
| `motion.easing.settle` | `cubic-bezier(0.2, 0, 0, 1)` | Overlay와 장면의 감속 |

- Pressed는 즉시 2px 이동하고 hard shadow를 4px에서 2px로 줄입니다.
- 무한 반복, 자동 깜빡임, 시차 배경과 읽기 뒤의 움직이는 별가루를 사용하지 않습니다.
- 로딩 Placeholder에는 shimmer를 사용하지 않습니다.
- 한 장면에서 동시에 움직이는 핵심 대상은 하나로 제한합니다.

### 7.2 Reduced Motion

`prefers-reduced-motion: reduce`에서는 장식성 duration을 0ms로 바꾸고 transform 이동과 단계 애니메이션을 제거합니다. 상태 변화, 포커스와 콘텐츠 자체는 숨기지 않습니다.

- 인트로는 정지 장면과 같은 서사 텍스트를 제공합니다.
- 질문 전환은 새 질문을 즉시 교체하고 포커스·상태를 유지합니다.
- F10→F11의 공간 연결은 이동 없이 같은 정보·입력 가능 상태로 즉시 전환합니다. 모션이 입력 시작이나 라우트 포커스를 지연시키지 않습니다.
- 기억 조각은 형성 과정을 생략하고 완료 정지화면과 누적 수를 즉시 표시합니다.
- 성공·오류 의미는 모션 없이도 아이콘과 문구로 동일하게 전달합니다.

### 7.3 기억 조각과 햅틱

`CMP-024 MemoryFormation`은 최초 저장 성공에만 실행합니다([Rules AN-06 · L71](../../docs/ARCA_MVP_RULES.md#4-응답과-기억-조각)). 표현 목표는 **내가 남긴 말이 보존되는 연결감**입니다([D-UI-038 · L96](./DECISIONS.md#6-시각-표현과-탐색)).

- 첫 비교안은 F10의 질문 위치·폭을 F11의 작성 공간으로 이어받고, F12에서 작성 영역의 빛이 작은 기록편으로 접혀 남는 장면입니다. 저장한 응답의 시작부터 이어지는 일부를 기록편 옆의 읽을 수 있는 실제 텍스트로 함께 남깁니다. 03·04가 발췌의 위치·길이·일부 표시를, 05가 저장 정본 확인을 소유합니다([D-UI-058 · L121](./DECISIONS.md#8-핵심-경험과-화면별-위계), [Rules AR-09 · L91](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)).
- Violet 픽셀의 개수·4단계 형성·비대칭 결정 실루엣을 고정하지 않습니다. 얇은 기록편의 형태·빛·움직임은 탐색 가능한 표현이고 채택본을 에셋 원본으로 기록합니다.
- 감정·작성 길이에 따른 등급·희귀도·보상 차이를 만들지 않습니다. 실제 사용자 본문을 연출 에셋이나 외부 생성 도구에 전달하지 않습니다.
- 서버 저장 성공 뒤에만 시작하고 최대 2초 안에 완료 정지화면·성공 문구·누적 수를 제공합니다. 성공 여부를 연출 재생 완료에 의존시키지 않습니다.
- 화면 탭, 명시적 건너뛰기 조작, 키보드 Enter·Space 중 하나로 즉시 완료할 수 있습니다. Reduced Motion은 즉시 완료 정지화면으로 대체하고 스크린 리더에는 완료 결과만 한 번 알립니다.

서버 저장 성공을 확인한 뒤 공식 SDK의 `softMedium` 햅틱을 한 번만 호출합니다. 호출 실패·미지원·시스템 설정으로 인한 무반응은 저장 성공과 화면 전이를 막지 않습니다. 수정 저장, 목록 진입, 단순 버튼 조작에는 재사용하지 않습니다. 햅틱 계약은 D-UI-030을 유지하고 형상·연출은 D-UI-038을 따릅니다.

## 8. 픽셀아트·아이콘·에셋

### 8.1 장면 래스터 규격

[D-UI-040 · L98](./DECISIONS.md#6-시각-표현과-탐색)에 따라 정수 배율을 유지하면서 장면마다 구도를 설계합니다.

| 항목 | 기준 |
|---|---|
| 원본 크기 | 장면·레이어별 결정, 120 source px 폭을 의무화하지 않음 |
| 표시 배율 | 기본 1 source px = 4 CSS px, 채택본의 정수 배율 기록 |
| 구도 | 공유 배경과 핵심 전경 분리, 장면별 기준 위치·허용 crop 명시 |
| 안전 영역 | viewport가 아닌 gutter·panel padding을 제외한 실제 장면 컨테이너에서 검증 |
| 원본 | 편집 가능한 레이어 원본과 lossless PNG |
| 운영 export | lossless WebP 우선, 필요할 때 PNG fallback |
| 보간 | `image-rendering: pixelated`, smooth interpolation 금지 |
| 정적 장면 상한 | 파일당 150KB |
| sprite·모션 상한 | 파일당 500KB |
| 초기 eager 이미지 | 모든 레이어·poster를 합산해 300KB 이하 |

- 작은 화면에서 무조건 중앙을 남기는 방식 대신 핵심 전경의 기준 위치를 정수 좌표로 재배치합니다. 비정수 축소로 화면에 맞추지 않습니다.
- 레이어 분리는 구도를 위한 것이며 움직이는 시차 배경을 허용하는 근거가 아닙니다. 핵심 오브젝트·텍스트 여백을 container별로 보존합니다.
- 초기 화면의 최소 자원만 eager로 불러오고 이후 인트로·완료 장면은 지연 로딩합니다. 장면의 실제 텍스트·입력·저장 완료는 poster/font/motion 로딩 완료를 기다리지 않습니다. 컨테이너 영역을 먼저 확보해 자원 도착이 커서·버튼을 밀지 않게 하며 실패는 장식의 정적 fallback으로 격리합니다. 로딩 경계와 성능 증거는 [06 §10.5 · L626–634](./06_FRONTEND_SPEC.md#105-시각-자원-로딩과-실패-격리)를 따릅니다.
- 핵심 서사·상태 문구는 실제 텍스트로 제공합니다. 큰 글자에서 장면이 텍스트를 가리거나 레이아웃 높이를 잠그지 않습니다.
- 320px viewport 안의 실제 장면 폭, 기본 폭, 480px 콘텐츠 폭과 큰 글자에서 구도를 비교합니다. 핵심 의미가 잘리면 전경 배치나 대체 구도를 조정하고, 재배치할 수 없는 장식은 생략합니다.
- 각 채택본의 레이어·배율·기준 위치·허용 crop·정적 대체를 Asset Manifest와 기준 원본에 기록합니다.

### 8.2 아이콘 체계

일반 조작 아이콘은 Pixelarticons Free Base를 기본 후보로 필요한 외부·자체 아이콘을 선별합니다. JOY·SEMA·기억 조각의 도메인 의미는 ARCA가 소유합니다. 출처가 달라도 화면에서는 아래 문법을 통일합니다(D-TECH-053; D-UI-021의 출처 제한 대체).

| 토큰·규칙 | 값 |
|---|---|
| 기준 제작 격자 | ARCA 신규 제작 기본 `24 × 24`; 외부 원본은 원래 격자를 기록하고 표시 크기에서 정수 배율·선명도 검증 |
| `icon.size.default` | `24px` |
| `icon.size.emphasis` | `48px` |
| 색상 | `currentColor` |
| 일반 스타일 | outline을 기본으로 같은 픽셀 밀도·선 굵기·광학적 크기·상태 표현으로 통일; 출처 혼합 허용 |
| 활성 상태 | 별도 게임형 badge가 아니라 배경·텍스트·테두리 토큰으로 표시 |

예정된 일반 의미는 Back, Close, Settings, Edit, Delete, Copy, Retry, Check, Chevron, Today, Archive입니다. 실제 package export 이름과 Free 포함 여부는 `06`에서 확인하고, 운영에 쓰는 개별 목록과 버전·라이선스는 Asset Manifest `AST-008`에 승인합니다.

- 아이콘 font는 사용하지 않고 SVG 또는 React SVG 컴포넌트를 사용합니다.
- 외부 원본을 무조건 24px에 늘려 맞추지 않습니다. 정수 배율로 맞지 않으면 표시 박스 안의 여백 조정·격자에 맞춘 수정·다른 원본을 비교하고 채택 크기를 기록합니다.
- 의미가 같은 아이콘은 화면마다 다른 그림으로 바꾸지 않습니다.
- 주요 저장·삭제 행동은 아이콘만으로 표시하지 않습니다.
- 텍스트와 함께 있는 아이콘은 `aria-hidden="true"`로 처리합니다.
- 플랫폼이 직접 그리는 아이콘은 Pixelarticons로 교체하거나 복제하지 않습니다.

### 8.3 도메인 시각 서명

| 개념 | 승인 방향·기본안 | 함께 표시할 정보 | 필수 제약 |
|---|---|---|---|
| JOY | Cyan을 중심으로 한 작은 기계 얼굴 또는 관측등 등 기억 가능한 시각적 인격 | 발신자 Label, 최초 1회 설명 | 감정 추정·친밀도·출석 압박·대화 기능으로 확장하지 않음 |
| SEMA | 미응답은 질문과 작성 행동이 먼저, 완료는 응답 발췌 뒤 보조 문맥 | 현재 또는 저장 당시 질문, JOY·실제 KST 날짜·SEMA 코드 | 스캔선·진단 그래프·무한 파동 금지 |
| 응답 | 잉크색 RecordPanel 기본안, 본문 서체와 작은 시작 공간 | 입력·글자 수·비공개·기기 임시 보관·오류 | 감정 분석색·점수 금지, 서버 기록 저장과 구분 |
| 기억 조각 | 작성 공간에서 이어지는 작은 기록편, Violet 빛은 기본안 | 실제 텍스트 원문 일부·저장 완료 문구·누적 수 | 희귀도·등급·보상 상자 금지 |
| 누적 수 | 채택된 기록편의 작은 아이콘과 숫자 | 단순 누적 개수 | 진행률·연속 출석·순위 금지 |
| 항해 기록 | 원문 발췌 중심의 한 열 MemoryRow와 실제 연월 구획 | 응답 일부·질문 일부·날짜 | 인벤토리·수집 타일·AI 요약·미작성 기간 빈칸 금지 |

JOY의 얼굴·상징 형상은 탐색할 수 있지만 첫 비교안은 표정 변화 없는 작은 기계 얼굴 또는 관측등입니다. 상태 변화는 신호 도착·실제 저장 성공 등 확인 가능한 사건에만 연결합니다. 응답 내용이나 추정 감정에 반응하지 않으며 생성형 대화 기능을 추가하지 않습니다([D-UI-037 · L95](./DECISIONS.md#6-시각-표현과-탐색)).

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
| CMP-012 | `PixelCheckboxRow` | 필수 약관 한 항목의 동의와 전문 열람 | 네이티브 checkbox와 별도 link·button |
| CMP-013 | `SemaSignalPanel` | 현재 질문 우선, JOY·날짜·SEMA 코드 보조 조합 | ScenePanel 기반 domain composition |
| CMP-014 | `QuestionSwitchAction` | 기본·대체 질문의 명시적 전환 | PixelButton secondary 또는 text action |
| CMP-015 | `MemoryRow` | 원문 발췌 중심, 질문 일부·날짜 보조 목록 항목 | 하나의 link·button hit area |
| CMP-016 | `MemoryCount` | 채택된 기록편의 작은 아이콘과 누적 숫자 | 읽을 수 있는 텍스트, 진행률 역할 금지 |
| CMP-017 | `PixelAlertDialog` | 비가역·파괴 행동 확인 | headless modal 동작, ARCA 시각 |
| CMP-018 | `PixelSheet` | 문맥 선택·설명·복사 등 보조 흐름 | headless modal 동작, swipe만으로 닫지 않음 |
| CMP-019 | `PixelToast` | 행동 없는 일시적 성공·정보 | non-modal status, blocking Overlay 위 금지 |
| CMP-020 | `InlineStatus` | 입력·저장·추가 로딩 가까이의 상태·재시도 | `status` 또는 필요 시 `alert` |
| CMP-021 | `PixelPlaceholder` | shimmer 없는 정적 로딩 윤곽 | 장식은 숨기고 별도 상태 전달 |
| CMP-022 | `StatePanel` | 빈 상태·전체 오류·오프라인의 제목·설명·행동 | InsetPanel 기반 composition |
| CMP-023 | `PixelIcon` | 승인된 일반·도메인 SVG 표시 | 자체 상호작용 없음 |
| CMP-024 | `MemoryFormation` | 최초 저장 성공 형성·건너뛰기·완료 정지화면 | CSS·WAAPI 또는 승인 sprite |
| CMP-025 | `RootFloatingTabs` | F10·F20 루트 이동 | 공식 플로팅 탭 외곽 규격 adapter |

CMP의 이름·의미·상태·접근성은 출처와 무관하게 유지합니다. 구현 후보 매핑과 채택 기록은 [06 §2.4 · L97–117](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적)를 참조하며, 외부 라이브러리 이름을 새 제품 CMP로 추가하지 않습니다.

범용 `Card`는 만들지 않습니다. 화면은 의미에 따라 ScenePanel, RecordPanel, InsetPanel 중 하나를 선택합니다([D-UI-018 · L47](./DECISIONS.md#3-design-system-결정)).

### 9.2 Surface 계약

| 컴포넌트 | 배경·본문 문맥 | 기본 padding | 장식 기본안 |
|---|---|---:|---|
| CMP-003 PixelCanvas | canvas / on-dark | layout gutter | 장식 없음 |
| CMP-004 ScenePanel | scene / on-dark | 24px | 구도에 따라 plain 또는 12px step·outlined |
| CMP-005 RecordPanel | record / on-dark, 문서용 document / on-light | 20px | plain 기본, 필요 시 8px step·outlined |
| CMP-006 InsetPanel | inset-light 또는 inset-dark | 16px | plain 기본, 필요 시 4px step·outlined |

- Surface의 의미와 light/dark 문맥, 장식 강도 plain/outlined를 구분합니다. 같은 위계의 surface를 반복 중첩하지 않습니다.
- 읽기·보조 영역은 border·shadow 없이 면과 여백으로 구분할 수 있습니다. 입력 control의 경계·포커스는 별도로 유지합니다.
- ScenePanel 안의 입력은 RecordPanel의 기록 문맥으로 분리하되 밝은 색이나 외곽선으로만 구분하도록 강제하지 않습니다.
- RecordPanel의 본문 뒤에 장면 픽셀아트나 별가루를 깔지 않습니다.

### 9.3 Button 계약

| 항목 | 계약 |
|---|---|
| Variant | `primary`, `secondary`, `danger`, `ghost` |
| 높이 | 최소 52px, IconButton은 44×44px |
| Padding·gap | inline 20px, icon gap 8px |
| Primary | 화면당 최대 하나, `color.brand.primary`, 2px border, 4px hard shadow |
| Pressed | 즉시 2px 이동, shadow 2px로 축소 |
| Hover | fine pointer 환경에서만 경계 명도 변화, glow 없음 |
| Focus | 2px·3:1 이상 focus ring과 2px offset |
| Disabled | 네이티브 `disabled`, shadow 제거, disabled 시각과 cursor 사용 |
| Loading | 크기와 Label 영역 유지, `aria-busy`, 중복 실행 금지 |

위험 행동을 Primary 색으로 위장하지 않습니다. 삭제의 정확한 확인 단계와 문구는 `04`, 실행 결과와 API 오류는 `05`가 소유합니다.

Primary가 없는 읽기 화면도 정상입니다. F21의 수정·삭제는 보조 역할을 사용하고, F13의 날짜 변경 직후 복사는 주 복구 행동으로 강조합니다. F12의 Primary는 첫 조작 가능 시 확인한 수로 03의 역할을 정하고 같은 방문 동안 위치·이름·강조를 유지합니다. 늦은 누적 수 조회는 정보만 갱신하며 정확한 고정 시점은 04 IX-039를 따릅니다([D-UI-061·D-UI-063·D-UI-066 · L124–129](./DECISIONS.md#8-핵심-경험과-화면별-위계)).

### 9.4 Field 계약

CMP-009는 위에서 아래로 `Label → Control → Help·Draft status와 Count → Error` 순서를 유지합니다([D-UI-027 · L54](./DECISIONS.md#3-design-system-결정)).

| 상태 | 시각·의미 계약 |
|---|---|
| Default | 입력값은 본문 서체, surface에 맞는 on-dark/on-light 전경과 식별 가능한 2px control border |
| Hover | fine pointer에서 border만 한 단계 강조 |
| Focus | 별도 focus ring, Label 유지, cursor가 보임 |
| Error | Danger border·아이콘·문구, `aria-invalid=true`, error ID 연결 |
| Read-only | 값 선택·복사 허용, 수정 불가 설명, Disabled 색과 구분 |
| Disabled | 포커스·수정·제출 불가, native disabled 사용 |

- Placeholder는 예시일 뿐 Label이나 요구사항을 대신하지 않습니다.
- 응답은 1~2,000자, 닉네임은 정규화 후 보이는 문자 2~12자라는 제품 규칙을 표시·검증합니다. 정확한 계산과 오류 노출 시점은 `04`, 서버 계약은 `05`가 소유합니다.
- 글자 수는 입력과 같은 접근성 설명에 연결하되 매 키 입력마다 live announcement를 만들지 않습니다.
- 임시 저장 상태는 오류와 같은 위치를 경쟁하지 않도록 Help row에 표시합니다.
- 응답 입력 가까이에 짧은 비공개 설명을 제공합니다. 기기 임시 보관 성공과 서버 기록 저장 성공을 구분하며 실제 쓰기 성공을 확인하기 전에 보관 완료를 표시하지 않습니다. 실패 시 본문을 유지하고 미보관 상태를 알립니다. 정상 상태는 짧은 Label로 표시하며 긴 보관 원리 설명은 첫 작성·펼쳐 읽기 조건을 적용합니다. 높은 오류와 함께 발생한 미보관 위험을 숨기지 않습니다. 정확한 문구와 설명 연결은 04 IX-037~038이 소유합니다([D-UI-060 · L123](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- Textarea는 초기 3~4줄의 기본 공간에서 시작하고, 복원된 임시본·기존 긴 응답은 첫 표시부터 내용에 맞춰 확장합니다. 고정 px 상한 뒤 내부 스크롤로 전환하지 않습니다([D-UI-036 · L94](./DECISIONS.md#6-시각-표현과-탐색)).
- 키보드가 열린 실제 공간과 사용자 글자 크기를 기준으로 페이지를 스크롤하며 커서·오류·글자 수·저장 행동에 도달할 수 있어야 합니다. 1자·2,000자·한글 조합·붙여넣기·줄바꿈·큰 글자·키보드 열고 닫기에서 커서와 스크롤을 검증합니다.

### 9.5 약관 Checkbox 계약

- CMP-012는 네이티브 checkbox를 사용하고 시각적 24px 체크 상자와 전체 행 44px 이상의 타깃을 제공합니다.
- checkbox Label은 선택을 바꾸고, 전문 보기는 별도 44px link·button으로 열리며 선택 상태를 바꾸지 않습니다.
- 서비스 이용약관과 개인정보처리방침 두 항목을 독립적으로 표시합니다.
- 두 필수 항목이 모두 선택되기 전 주 행동은 비활성화합니다.
- MVP에는 전체 동의, 선택 동의와 마케팅 동의를 만들지 않습니다([Rules ON-02~ON-03 · L35–36](../../docs/ARCA_MVP_RULES.md#2-최초-탑승과-승객)).
- 승객 생성 실패 뒤에도 선택 상태가 유지되어야 하며, 상태 소유와 복원은 `06`이 정의합니다.

### 9.6 질문·기억 계약

- CMP-013의 내부에서는 현재 질문이 메타보다 먼저 읽히며, F10 미응답·F11에서는 질문이 화면의 첫 콘텐츠입니다. F10 미응답의 작성·질문 전환 묶음은 질문 가까이 두고 메타는 그 뒤에 둡니다. F10 완료에서는 RecordPanel의 응답 발췌가 먼저이고, 선택 질문·JOY·실제 날짜·SEMA 코드는 보조 문맥입니다. 필수 메타데이터를 숨기지 않습니다([D-UI-057·D-UI-062 · L120–125](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- CMP-014는 질문 아래에서 기본·대체 질문을 명시적으로 전환합니다. Segmented control, swipe, carousel과 추가 질문 무한 요청을 사용하지 않습니다([Rules SE-08 · L56](../../docs/ARCA_MVP_RULES.md#3-오늘의-sema)).
- CMP-015는 사용자 본문 서체의 응답 원문 발췌를 중심으로 질문 일부·날짜를 보조 배치하는 전체 너비 행입니다. SEMA 코드는 필요한 경우 보조 정보로 둡니다. 행은 여백·면 또는 구분선으로 구별하며 2px 선을 의무화하지 않습니다. 한 열과 전체 행 hit area를 유지하고 인벤토리·수집 타일로 표현하지 않습니다([D-UI-039 · L97](./DECISIONS.md#6-시각-표현과-탐색)).
- 발췌의 원문·비공개·수정·삭제 규칙은 [Rules AR-01·AR-09 · L83–91](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)를 따르며 F10·F12·F20에 동일하게 적용합니다. 발췌임을 표시하고 전문은 상세에서 제공합니다. 길이·줄바꿈·문구는 03·04, 발췌 필드·생략 여부·수정/삭제/날짜 변경 갱신 계약은 05, 캐시 동기화는 06에 연결합니다. 발췌를 위해 목록의 행마다 상세 API를 추가 호출하는 구조에 의존하지 않습니다.
- F20의 월 제목은 MemoryRow 바깥의 목록 그룹 heading으로 제공하고 행별 날짜·전체 행 hit area를 유지합니다. 실제 KST 작성 연월의 경계만 표시하며 페이지를 나눠 읽어도 같은 월 제목을 중복하지 않습니다. 빈 날·월을 만들지 않습니다([D-UI-064 · L127](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- F21은 질문 전문을 서문 위계로 먼저 두고 응답 전문을 주 읽기 영역으로 둡니다. 질문을 접거나 말줄임하지 않으며, 본문 아래 수정·삭제는 읽기를 마친 뒤 선택하는 보조 행동입니다([D-UI-065~D-UI-066 · L128–129](./DECISIONS.md#8-핵심-경험과-화면별-위계)).
- CMP-016은 채택된 기록편의 작은 아이콘과 누적 수를 텍스트로 읽으며 `progressbar`, 등급과 streak 의미를 부여하지 않습니다.

### 9.7 Overlay·상태 계약

| 컴포넌트 | 사용 조건 | 포커스·알림 | 사용하지 않는 조건 |
|---|---|---|---|
| CMP-017 PixelAlertDialog | 삭제·비가역 확인 | 안전한 행동에 초기 포커스, 종료 뒤 trigger 복귀 | 일반 성공·설명·단순 오류 |
| CMP-018 PixelSheet | 문맥 선택·설명·보조 행동 | modal focus, 명시적 닫기와 Android Back | 파괴 행동의 최종 확인 |
| CMP-019 PixelToast | 행동 없는 일시적 성공·정보 | polite, 포커스를 이동하지 않음 | 재시도가 필요하거나 차단 Overlay가 열린 상태 |
| CMP-020 InlineStatus | 필드·버튼·목록 가까이의 상태·재시도·IX-042 갱신 안내 | 기본 polite, 차단 오류만 assertive | 화면 전체 시작 실패 |
| CMP-021 PixelPlaceholder | 초기·부분 데이터 대기 | 시각 윤곽은 aria-hidden, 상태는 별도 한 번 | shimmer·무한 애니메이션 |
| CMP-022 StatePanel | 기록 없음·전체 오류·오프라인 | 제목·설명·최대 하나의 복구 행동 | 정상 데이터 위를 가리는 modal |

동일 영역의 InlineStatus는 주 오류와 유실 위험·복사 필요성을 하나의 읽기·발표 단위로 결합할 수 있습니다. 복사 실패의 직접 선택 방법은 시각 UI와 접근성 모두에 제공합니다. 정확한 발생 조건, 유지 시간, 우선순위와 한국어 문구는 `04`가 소유합니다. 오류 종류와 복구 가능성은 `05`를 참조합니다.

### 9.8 루트 탭 계약

- CMP-025는 F10과 F20에서만 표시하고 탭 수는 `오늘`, `기록` 두 개로 고정합니다.
- 앱인토스가 제공한 최신 플로팅 외곽 형태, 위치와 Safe Area 규격을 우선합니다.
- ARCA가 제어할 수 있는 내부 아이콘·Label에만 승인된 픽셀 아이콘과 Neo둥근모를 적용합니다.
- 상세·작성·인트로·설정·오류 화면에는 표시하지 않습니다.
- 현재 탭은 색만이 아니라 접근성 selected 상태와 Label로 구분합니다.
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
- 추가 페이지를 불러올 때는 기존 MemoryRow를 유지하고 마지막 행 아래 CMP-020을 표시합니다.
- 하나의 요청을 여러 live region에서 중복 발표하지 않습니다([D-UI-023 · L51](./DECISIONS.md#3-design-system-결정)).

F20의 보류한 최신 목록은 CMP-020과 CMP-007의 보조 행동으로 알립니다. 기존 행을 밀지 않는 위치에 두고 자동 focus/scroll 없이 읽던 문맥을 보존합니다. 표시·적용·폐기 조건과 문자열은 04 IX-042가 소유하며 새 상태 컴포넌트를 만들지 않습니다.

### 11.2 빈 상태와 오류

- 기록 없음은 CMP-022 안에 선택적인 장식 이미지, 제목, 설명과 오늘의 SEMA로 이동하는 하나의 행동을 둡니다([Rules AR-02 · L84](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)).
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
- MemoryFormation은 탭, 명시적 Button, Enter와 Space로 건너뛸 수 있습니다.
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

[01 §10 · L192–217](./01_UI_OVERVIEW.md#10-에셋과-디자인-원본)의 핵심 흐름 비교·시각 채택을 따릅니다([D-TECH-025 · L89](./DECISIONS.md#6-시각-표현과-탐색)). Figma와 코드 프로토타입을 모두 허용하고, 채택본마다 기준 원본 하나와 그 버전을 명시합니다.

- Figma를 원본으로 선택하면 사용자 소유 `ARCA / MVP` 파일에 Foundations, Components, Domains, Screens, QA를 구성합니다. 번호·구성은 작업 규모에 맞춰 조정할 수 있습니다.
- 코드를 원본으로 선택하면 저장소 경로·commit과 재현 방법을 기록합니다. 다른 도구의 화면은 파생본으로 연결하며 전체 Figma 복제를 요구하지 않습니다.
- 기준 원본에는 화면·CMP ID와 토큰을 연결합니다. 레이아웃의 시각 원본이 필드·행동·API 계약을 덮어쓰지 않습니다.
- 시각 채택 시 비교한 차이, 추천 이유, 읽기·키보드·스크롤·Reduced Motion·실기기 검증과 남은 한계를 기록합니다. 현재는 방향·기본안 승인 상태이며 이 증거의 제작은 남아 있습니다.

### 13.2 컴포넌트 변경 규칙

- 의미·행동·접근성을 보존하는 시각 기본값 조정과 호환 variant 추가는 같은 CMP ID를 사용합니다. 비호환 필수 계약 변경은 새 ID와 대체 관계를 만듭니다.
- 운영 화면은 의미 기반 토큰과 컴포넌트를 사용합니다. 표현 실험은 별도 프로토타입에서 임시 값·컴포넌트로 시작할 수 있고 문서 선행 갱신을 요구하지 않습니다([D-TECH-024 · L88](./DECISIONS.md#6-시각-표현과-탐색)).
- 기본값을 채택할 때 토큰·컴포넌트·소유 명세와 검증 근거를 같은 변경에 반영합니다. 승인 방향을 바꾸면 새 DECISIONS ID와 대체 관계를 기록합니다.
- 외부 에셋·폰트·아이콘과 채택된 원본 변경은 Asset Manifest의 권리·버전·운영 승인 상태를 함께 갱신합니다.
- 공통 컴포넌트의 정확한 TypeScript props와 파일 경로는 06이 이 계약을 소비해 정의합니다.

### 13.3 남은 시각 채택 작업

에셋별 확보·권리·사용 승인 상태는 [Asset Manifest · L1–11](../../design/assets/ASSET_MANIFEST.md), 화면별 시작안·검증 결과는 [03 §10 · L931–957](./03_SCREENS_SPEC.md#10-권장-시작안검증할-결과채택-상태)에서 관리합니다.

- [ ] 기존 로고 2종의 출처·사용 권리 확인과 인트로 스토리보드·장면, JOY·SEMA·기억 조각 에셋 제작·사용 승인
- [ ] 선별 아이콘·Neo둥근모 파일의 출처·라이선스·실제 표시 품질 확인
- [ ] 픽셀·본문 서체 조합의 한글·영문·숫자·이모지 fallback과 iOS·Android 읽기 품질 검증
- [ ] F01 장면·원문 읽기, F03 단일 진행, F13 복사 우선 검증; 320px·큰 글자·Reduced Motion 상태를 채택 원본에 포함
- [ ] 선별 CMP와 생성 배경의 §1.4 통합, 전 상태·아이콘 격자·장식 실패 시 픽셀 정체성과 Acceptance #53 검증
- [ ] F10 → F11 → F12의 공간 연결·서체 역할·입력 명도·실제 텍스트와 기록편 연출 비교
- [ ] 작은 초기 입력과 긴 응답 확장, inline/조건부 저장 바, 200% 글자·키보드·단일 주 스크롤·단일 저장 조작 검증
- [ ] JOY의 기계 얼굴/관측등 후보와 사건에 한정한 상태 표현 채택
- [ ] F10 완료·F12·F20의 발췌, 첫 기억/반복 기록, 월 구획과 F21 질문 서문·읽기 위계를 합성 데이터로 검증
- [ ] 실제 장면 컨테이너의 전경 위치·crop·대체 구도 검증
- [ ] iOS·Android 실제 토스 환경에서 검증하고 기준 원본·채택값·증거 기록

이 항목은 열린 제품 계약과 구분합니다. 독립된 계약·상태·접근성 구현과 비운영 탐색을 계속할 수 있지만, 시각 검증·에셋 사용 승인을 완료한 것으로 표시하지 않습니다.

## 14. 관련 계약과 후속 검증

화면별 CMP 조합은 [03 §3 · L103–123](./03_SCREENS_SPEC.md#3-화면-범위와-추적-지도), 동작·문구는 [04 §6 · L351–371](./04_INTERACTIONS_AND_COPY.md#6-화면별-상호작용-인벤토리), 선별 UI·스타일은 [06 §2.4 · L97–117](./06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적) 및 [06 §2.5 · L119–126](./06_FRONTEND_SPEC.md#25-공통-스타일과-의존성-경계)에서 찾습니다.

합성 입력은 [07 §3.5 · L61–74](./07_MOCK_SCENARIOS.md#35-합성-콘텐츠와-민감정보), 시각 채택·접근성 증거는 [08 §10 · L179–194](./08_QA_AND_INTEGRATION.md#10-성능-시각과-사용성) 및 [08 §7 · L126–138](./08_QA_AND_INTEGRATION.md#7-입력-접근성-플랫폼-검증)로 연결합니다. 이 문서의 §13.3이 채택 상태를 소유합니다.

## 15. 외부 의존성 근거

플랫폼·아이콘·서체의 채택 근거로 참조하는 공식 출처입니다. 설치 버전·SDK export의 확인은 [06 §2 · L51–126](./06_FRONTEND_SPEC.md#2-실제-자료와-기술-기반)에서, 실제 파일·권리·고지는 Asset Manifest에서 관리합니다.

- [앱인토스 FAQ](https://developers-apps-in-toss.toss.im/guide/faq.md)·[UI/UX 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md): §1.2의 플랫폼 UI 경계
- [Pixelarticons 공식 문서](https://pixelarticons.com/docs/): §8.2의 기본 아이콘 후보
- [Neo둥근모 공식 저장소](https://github.com/neodgm/neodgm): §4의 서체 파일·라이선스
- [Device.triggerHaptic](https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/device/device.triggerhaptic.md): §7.3의 햅틱 capability
