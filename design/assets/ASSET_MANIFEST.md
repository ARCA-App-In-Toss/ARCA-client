# ARCA 에셋 매니페스트

- 문서 버전: v1.25
- 최근 수정일: 2026년 9월 30일
- 상태: 확정
- 승인 주체: 제품 책임자

이 문서는 ARCA 프런트엔드에서 사용하는 로고, 픽셀아트, 일러스트, 아이콘, 폰트와 모션 에셋의 원본·권리·제작 상태를 계속 추적하는 문서입니다. 운영 빌드에는 상태가 `사용 승인`인 에셋만 포함합니다. 전역 방향과 디자인 원본 정책은 [UI Overview §10](../../.claude/spec/01_UI_OVERVIEW.md), 납품 규격은 [Design System §8](../../.claude/spec/02_DESIGN_SYSTEM.md)을 따릅니다.

<br>

## 1. 상태 정의

| 상태 | 의미 |
|---|---|
| 제작 필요 | 용도는 확정됐지만 사용할 파일이 없음 |
| 검토 중 | 파일은 있으나 품질, 출처, 권리 또는 규격 확인이 남음 |
| 사용 승인 | 용도·품질·출처·사용 권리를 확인해 운영 사용 가능 |
| 교체 필요 | 임시 사용했거나 현재 기준에 맞지 않아 운영 전 교체 필요 |
| 사용 안 함 | MVP에 포함하지 않기로 확정 |

<br>

## 2. 에셋 목록

| ID | 종류·용도 | 우선순위 | 상태 | 현재 원본·출처 | 권리 확인 | 납품·구현 기준 | 접근성·대체 기준 |
|---|---|---|---|---|---|---|---|
| AST-001 | ARCA 마스터 로고 | P0 | 검토 중 | [`design/logo/ARCA_LOGO.png`](../logo/ARCA_LOGO.png), 1254×1254 PNG, RGB, alpha 없음 | 제작자·생성 방식·ARCA 서비스 및 홍보 사용 권리 확인 필요 | 편집 가능한 원본 또는 생성 이력 보존, 색상 기준 추출 | 장식 사용 시 대체 텍스트 없음, 브랜드 식별 시 `ARCA` |
| AST-002 | 앱인토스 앱 아이콘 | P0 | 검토 중 | [`design/logo/ARCA_LOGO_FOR_APP_IN_TOSS.png`](../logo/ARCA_LOGO_FOR_APP_IN_TOSS.png), 600×600 PNG, RGB, alpha 없음 | AST-001과 같은 권리 확인 필요 | 최신 앱인토스 콘솔 아이콘 규격과 실제 축소 노출 확인 | 콘솔·내비게이션에서 서비스명과 함께 인식 확인 |
| AST-003 | 화면용 투명 심볼·워드마크 | P1 | 제작 필요 | AST-001을 기준으로 새 원본 제작 | AST-001 권리 확인 후 파생 제작 승인 | 투명 배경, 밝은·어두운 장면용 최소 변형만 제공 | 로고 텍스트를 본문 정보 대신 사용하지 않음 |
| AST-004 | F01 인트로 6장면 픽셀 세트 | P0 | 검토 중 | [인트로 서사](../../docs/ARCA_INTRO_STORY.txt), [Screens Spec F01](../../.claude/spec/03_SCREENS_SPEC.md#42-f01--인트로). 운영 표시: 생성 이미지 `AST-004/export/scene-{1~6}.webp`(156×156 셀, lossless, 2~4KB, 로컬 격자 PNG와 픽셀 동일)를 `src/ui/pixel/intro.tsx`의 `IntroScene`이 표시(장면 1 즉시, 2~6 유휴 시점 prefetch, 전환은 `arca-intro-scene-enter` 320ms·4단계 겹침, 로딩 실패 시 해당 코드 장면). 코드 원본(fallback): `src/ui/pixel/scenes.tsx`의 `introScenes`(56×30 격자 SVG, 4 CSS px/셀, 224×120px, `발견 → 함선과 동면 → 소이와 JOY → 이유 → 질문과 기억 → 탑승`), 토큰 색만 사용·정적·텍스트 미포함. 생성 이미지 규격: 156×156 셀 정사각 원본, 핵심 안전 띠 50~105열 × 12~87행, 좌우 확장(0~49·106~155열)은 배경만, 셀당 px는 `max(ceil(폭/156), min(floor(폭/90), floor(높이/110)))`(폰 약 90칸)·가로 가운데, 화면보다 짧으면 세로 가운데·길면 위쪽 기준, 위 10행·아래 28행은 바탕색으로 가라앉는 평면 색 계단. 장면 6은 셀당 `ceil(폭/156)` px, 짧으면 세로 가운데·길면 아래 기준, 아래 계단은 마지막 5행. 배율은 `src/ui/styles/intro.css`의 `.arca-intro-scene`·`.arca-intro-scene--whole`(CSS `round()` 미지원 엔진은 비정수 cover). 생성: ChatGPT 기본 이미지 생성(모델명 표시 없음, 품질 high), 2026-09-28~29 생성, 장면별 새 대화에서 1:1 정사각 한 번에 생성. 생성 지시 `prompts/AST-004_INTRO_PROMPTS.md`, 원본 `AST-004/source/scene-{n}-square-v*.png`, 레퍼런스 `AST-004/reference/`, 격자 PNG `AST-004/grid/`, 격자 정리 `AST-004/tools/build_grid.py`·`fixes.py`(장면별 허용 색·공통 인물 스프라이트·장면 5 계단 빛 2단·장면 6 상태등 대칭)는 로컬 작업물로 저장소에 두지 않음(.gitignore). 실기기 미검증. | ARCA 전용 신규 제작. 코드 원본 중 1·3·4장면은 Claude, 나머지는 Codex 제작. 생성 이미지는 도구·모델·날짜·프롬프트 버전 기록 | 6장면. 배경·전경 분리, 정수 배율·기준 위치·허용 crop·실제 컨테이너 안전 영역, 파일당 150KB·초기 eager 레이어 합계 300KB 이하, 이후 지연 로딩 | 진행 정보·핵심 서사는 실제 텍스트로 제공. 서사를 이미지에 굽지 않고 Loading·실패·Reduced Motion에서 코드 원본 정적 fallback 유지 |
| AST-005 | JOY·SEMA 신호 표현 | P0 | 검토 중 | [D-UI-037·D-UI-058](../../.claude/spec/DECISIONS.md)의 비교 시안. 코드 원본: `src/ui/pixel/marks.tsx`의 `JoyMark`(12×12 관측등 렌즈, F00 4px/셀·48px, F11 2px/셀·24px). F10에는 JOY 그림 표식이 없고 AST-012 캡슐 배경 위 캡슐 디스플레이(`arca-capsule-display`)가 질문을 보이며 표정·감정 반응 없음 | ARCA 전용 신규 제작 | 작은 기계 얼굴·관측등 등 JOY 인격과 F10→F11의 질문 위치·폭·JOY 문맥 연결 비교, 신호 도착·실제 저장 사건에만 상태 연결, 기능 아이콘은 24×24, 정적 fallback | `JOY가 매일 보내는 신호`라는 첫 설명을 텍스트로 제공 |
| AST-006 | F12 기억 조각 연출·완료 정지화면과 F10 완료 기록편 | P0 | 검토 중 | [D-UI-038·D-UI-058·D-UI-062](../../.claude/spec/DECISIONS.md)의 비교 시안. 코드 원본: `src/ui/pixel/marks.tsx`의 `MemoryFragment`(14×12 격자의 면을 깎은 결정 조각, 윤곽 `memory.step-3`·밝은 면 `memory`·중간 면 `step-1`·그림자 `step-2`의 Violet 단계 명도; F12 4px/셀, F10 완료·누적 수 2px/셀)와 F02 `MemoryFragmentGlow`(8px/셀, 조각 모양에서 계산한 둘레 3겹 픽셀 빛, 3초 호흡·Reduced Motion 정지). 형성은 `src/ui/styles/formation.css`의 `.arca-formation`·`arca-fragment-form`(`steps(4)` 1,600ms, Reduced Motion 0ms, 결과·누적 수는 첫 프레임부터 표시) | ARCA 전용 신규 제작 | 응답 원문은 에셋에 넣지 않음. F10 완료는 정적 기록편만 재사용. 개수·단계·실루엣 고정 없음, 최대 2초 | 이동 행동은 진입 즉시 조작 가능, Reduced Motion에서는 즉시 완료 상태. 합성 데이터로만 시안 검증 |
| AST-007 | F20 기록 없음 보조 이미지 | P1 | 검토 중 | 코드 원본: `src/ui/pixel/scenes.tsx`의 `EmptyArchiveArt`(32×9 격자 빈 동면 포드, 4 CSS px/셀), 없어도 문구·행동 완결 | ARCA 전용 신규 제작 | 장면별 정수 배율·컨테이너 안전 영역 규격 적용, 없어도 행동과 의미가 완결 | 장식이면 대체 텍스트 없음, 빈 상태 문구를 대체하지 않음 |
| AST-008 | 기본 조작 픽셀 아이콘 | P0 | 검토 중 | ARCA 자체 제작 12×12 격자 아이콘 13종(back·chevron-right·settings·today·archive·memory·edit·delete·copy·check·close·lock·to-top)을 `src/ui/pixel/icons.tsx`의 `PixelIcon`에 코드 원본으로 두고 24px(2 CSS px/셀)로 표시. 외부 아이콘 팩 미포함 | ARCA 전용 신규 코드 제작(Codex), 외부 팩 미포함 | Back·Close·Settings·Edit·Delete·Copy·Retry·Check·Chevron·Today·Archive를 선별. 02 §8.2에 따라 원본 격자·표시 크기·선 굵기·광학적 크기 통일; 실제 import는 06 | 텍스트 동반 아이콘은 장식 처리, 아이콘 전용 버튼은 의미 이름과 44px 타깃 제공 |
| AST-009 | 화면 진입·기억 조각 모션 소스 | P0 | 검토 중 | 시간 토큰은 `src/ui/tokens.css`의 `motion.duration.*`. `arca-screen-enter`(`src/ui/styles/overrides.css`) 180ms opacity 진입: 화면(`shell.css`)·새로 나타나는 루트 탭(`tabs.css`)·준비된 F10 배경(`capsule.css`). F01(`src/ui/styles/intro.css`): 장면 전환 `arca-intro-scene-enter` 320ms·4단계, 마지막 대화창 퇴장 `arca-intro-dialog-close`·탑승 Primary 등장 320ms, 탑승 페이드아웃 `arca-intro-depart` 900ms·8단계, 대화창 글자 표시 35ms/글자(`src/screens/onboarding/useIntroPlayback.ts`). F02 `arca-glow-ring-*` 3,000ms 호흡(`src/ui/styles/hierarchy.css`, 반복 예외). F12(`src/ui/styles/formation.css`): `arca-fragment-form` 1,600ms·4단계 1회, 누적 수 다이얼 롤 `arca-count-roll` 400ms(형성과 함께 1,600ms에 멈춤). F20 추가 로딩 `arca-loader-step` 900ms 세 칸 순차 점등(`src/ui/styles/overlays.css`, 요청 중에만 표시되는 반복 예외). Reduced Motion 0ms·정지 | ARCA 코드와 에셋의 권리 기준 적용 | CSS 애니메이션으로 구현. 질문→작성 공간 연결은 입력·포커스를 지연시키지 않음. 작은 상태 타이밍은 기본값, 기억 연출 최대 2,000ms와 무한 반복 금지는 필수, 채택 원본·버전 기록 | `prefers-reduced-motion`에서 같은 정보의 즉시 정적 전환 |
| AST-010 | 사운드·음악 | 제외 | 사용 안 함 | 없음 | 해당 없음 | MVP 번들에 음원과 자동 재생 코드 미포함 | 시각·촉각만으로 모든 상태를 이해 가능하게 함 |
| AST-011 | Neo둥근모 브랜드·조작 서체 | P0 | 검토 중 | [Neo둥근모 공식 저장소](https://github.com/neodgm/neodgm) `v1.601` Regular WOFF2, 44,352 bytes. 저장소에 self-host: `public/fonts/neodgm/neodgm.woff2`(SHA-256 `0c0ca9cd…ef0a33bf`)와 `LICENSE.txt`(OFL 1.1 원문), `src/ui/tokens.css`의 `@font-face`·`font-display: swap` | SIL Open Font License 1.1과 저작권 고지를 font 파일과 함께 보존 | 픽셀 역할에 공식 WOFF2를 self-host, 외부 CDN·Bold·Italic 합성 금지, 본문은 AST-013, preload는 06에서 결정 | 픽셀·본문 역할 조합, 시스템 fallback·200% 글자·한글·영문·숫자·이모지 실제 기기 검증 |
| AST-012 | F10 투명 캡슐 배경(덮개·관측 돔과 시간대 하늘) | P0 | 검토 중 | 운영 표시: `AST-012/export/capsule.webp`(156×156 셀, lossless, alpha, 약 2.6KB)를 `src/ui/pixel/capsule.tsx`의 `CapsuleBackdrop`이 F10 렌더 시 불러와 표시(로드 완료 뒤 `arca-screen-enter`로 나타남, 실패 시 배경 없음). 머리부터 발끝까지 덮는 뼈대 없는 투명 유리 덮개. 생성: ChatGPT 기본 이미지 생성(모델명 표시 없음), 2026-09-29 생성, 1:1. 생성 지시 `prompts/AST-012_CAPSULE_PROMPTS.md`, 원본 `AST-012/source/capsule-square-v2.png`, 격자 PNG `AST-012/grid/`, 변환 `AST-012/tools/build_capsule.py`(AST-004 방식 양자화, 구조·선·시안 + 키 색만 허용, 키 색은 과반일 때만)·`fixes.py`(상태등 세 칸 3×3 대칭)는 로컬 작업물로 저장소에 두지 않음(.gitignore). 키 색 칸(유리 한 덩어리, 16~136행·14~142열)은 투명. 하늘은 `capsule.tsx`의 같은 격자 코드 층(`color.sky.*`, 2×2 디더링 띠·고정 별 배치, 시간대는 `src/ui/sky.ts`) | ARCA 전용 신규 제작. 생성 이미지는 도구·모델·날짜·프롬프트 버전 기록, 약관상 상업 이용·수정 가능 여부 확인 전 | 셀당 `max(ceil(폭/156), round(높이/170))` px(`src/ui/styles/capsule.css`의 `.arca-capsule-scene`), 화면 맨 위·가로 가운데, 넘치는 좌우·아래만 crop. 배경 층은 첫 화면 높이(100dvh)이며 본문과 함께 스크롤, 이미지보다 긴 부분은 `bg.scene` 면. 150KB 이하 | `aria-hidden` 장식. 글자·조작은 불투명 디스플레이·면 위에만. 로딩 전·실패 시 배경 없음(평면 canvas). 정지 장면이라 Reduced Motion 차이 없음 |
| AST-013 | Pretendard 본문 서체 | P0 | 검토 중 | [Pretendard 공식 저장소](https://github.com/orioncactus/pretendard) `v1.3.9`(npm `pretendard@1.3.9`의 `dist/web/static/woff2/Pretendard-Regular.woff2`) Regular WOFF2, 765,892 bytes, subset 없는 전체 파일. 저장소에 self-host: `public/fonts/pretendard/Pretendard-Regular.woff2`(SHA-256 `fad853f7…e8a61d63`)와 `LICENSE.txt`(v1.3.9 태그의 OFL 1.1 원문), `src/ui/tokens.css`의 `@font-face`·`font-display: swap` | SIL Open Font License 1.1과 저작권 고지를 font 파일과 함께 보존 | 질문·응답·설명·메타의 본문 역할에 Regular 한 굵기만 self-host, 외부 CDN·굵기 합성 금지. 사용자 응답의 모든 한글 음절을 위해 KS X 1001 subset을 쓰지 않음. preload·전송량은 06 §10.5에서 측정 | 로드 전·실패 시 시스템 fallback으로 즉시 읽기, 픽셀·본문 역할 조합·200% 글자·한글·영문·숫자·이모지 실제 기기 검증 |

<br>

본문 서체는 AST-013 Pretendard를 self-host합니다. 시스템 서체는 로드 전·실패 시 fallback으로만 사용합니다. 역할·fallback 기준은 [02 §4](../../.claude/spec/02_DESIGN_SYSTEM.md), 환경별 검증은 AST-011·AST-013의 조합 검증으로 추적합니다.

핵심 비교 시안과 시각 채택은 아직 완료되지 않았습니다. [01 §10](../../.claude/spec/01_UI_OVERVIEW.md)의 비교 증거와 기준 원본이 준비되면 이 표에 실제 경로·버전·채택일을 연결합니다. 방향 승인만으로 에셋을 `사용 승인`으로 전환하지 않습니다.

<br>

### 2.1 현행 UI 에셋과 남은 검증

AST-004 코드 장면과 AST-005~009는 ARCA용 격자 문자열·SVG rect·CSS로 직접 제작한 코드 원본입니다(제작자는 각 행의 권리 확인 칸). 외부 아이콘 팩·UI 라이브러리 에셋은 포함하지 않습니다. 생성 이미지는 AST-004(F01 6장면)와 AST-012(F10 캡슐 배경)이며 둘 다 156×156 격자 lossless WebP를 정수 배율로 화면 전체에 표시합니다. 코드 장면은 정수 셀과 토큰 팔레트를 사용하고 본문 뒤에 배치하지 않습니다. 장식 SVG·이미지는 `aria-hidden` 또는 빈 `alt`이며 실제 질문·답변은 DOM 텍스트입니다.

격자 문자열 SVG는 JS 모듈로 함께 묶입니다. 생성 이미지는 인라인하지 않은 별도 파일(`?no-inline`)로 제공하며, AST-004는 장면 1을 즉시·2~6을 유휴 시점에 prefetch하고 AST-012는 F10 렌더 시 불러옵니다. 표의 `검토 중`은 실제 토스 WebView·운영 사용 확인이 남았다는 뜻입니다. 기존 로고 출처/권리 미확인은 AST-001·002에 유지합니다. 합성 브라우저 증거와 제약은 [08 §14.1](../../.claude/spec/08_QA_AND_INTEGRATION.md#141-로컬-증거-기록)에 기록합니다.

## 3. 파일과 권리 기록 규칙

- 파일명은 `영역-용도-변형-배율.확장자`를 사용합니다. 예: `memory-fragment-complete-4x.webp`.
- 채택본마다 Figma 프레임 또는 코드·편집 원본 중 기준 원본 하나를 지정하고 경로·버전·채택일을 기록합니다. Figma를 선택하면 사용자 소유 `ARCA / MVP` 파일에 둡니다. 다른 표현물은 파생본으로 연결하며 전체 복제를 요구하지 않습니다.
- 저장소에는 빌드에 필요한 export와 원본 링크·제작자·생성 도구·승인일을 기록합니다. 장면은 레이어·정수 배율·기준 위치·허용 crop·실제 컨테이너별 대체 구도를 함께 남깁니다.
- 외부 스톡, 생성형 이미지, 오픈 라이선스 리소스를 사용하면 원문 라이선스와 상업적 이용·수정 가능 여부를 함께 보존합니다.
- 외부 패키지 에셋은 정확한 버전과 원문 라이선스를 기록하고, 허용 범위를 넘어 원본 세트를 재배포하거나 ARCA 고유 자산처럼 표시하지 않습니다.
- Neo둥근모는 공식 WOFF2와 SIL OFL 1.1·저작권 고지를 함께 저장하고 수정본처럼 표시하지 않습니다.
- 답변, 닉네임, 익명 식별키나 실제 사용자 기록을 에셋 원본·샘플 이미지·파일명·메타데이터에 넣지 않습니다.

<br>

### 3.1 자원 로딩과 실패 경계

[D-TECH-039·049](../../.claude/spec/DECISIONS.md)와 [06 §10.5](../../.claude/spec/06_FRONTEND_SPEC.md)의 공통 장면·로딩 정책을 적용합니다. 첫 질문/작성의 최소 셸·선별 AST-008과 실제 텍스트를 우선 제공하고 AST-011은 시스템 fallback으로 읽기를 유지합니다. 초기 경로에 불필요한 장면/폰트를 preload하지 않습니다.

AST-004 후속 장면·AST-007·AST-009의 비필수 motion은 경로/유휴 시점에 나누어 불러옵니다. 컨테이너 영역/정적 대체 구도를 먼저 확보하고 실패가 질문·입력·성공 heading·이동 행동을 막지 않게 합니다. 저장 성공 뒤 늦은 자원 도착으로 연출을 재시작하지 않습니다. 원문은 실제 DOM에만 두고 에셋/퇴장 장면에 복제하지 않습니다.

첫 경험 slice부터 기기/네트워크별 전송량·질문 표시/입력 가능 시점·입력 지연·layout shift를 확인합니다. 표의 용량 상한과 권리/승인 상태는 유지하며 baseline·채택 예산·증거는 08에서 추적합니다. 로딩 방향 승인만으로 에셋 사용을 승인하지 않습니다.

### 3.2 선별 UI와 생성 에셋의 연결

- 배경·JOY·기억 표현은 ChatGPT 등으로 생성/제작할 수 있습니다. 기존 AST-004~007·009에 도구·생성 이력 또는 참조 위치·원본/편집본·실제 export·표시 규격을 연결합니다. 생성 계획만으로 제작·사용 승인을 완료 처리하지 않습니다.
- 생성 지시에는 02의 팔레트 역할·픽셀 밀도·명암·전경/배경 분리·텍스트 안전 영역과 실제 컨테이너 구도를 포함합니다. 결과물은 UI와 함께 표시해 계단형 윤곽·정수 배율·crop·가독성을 확인하고, 텍스트나 조작을 이미지에 굽지 않습니다.
- UI 코드의 출처·정확 버전/commit·로컬 수정·갱신 기록은 06 §2.4가 소유합니다. 이 문서는 실제 포함하는 아이콘·폰트·이미지·sprite와 관련 권리를 추적합니다. 라이브러리 코드와 포함 에셋의 사용 조건은 각각 확인하며, 코드의 MIT 표기를 아이콘 팩 등에 일괄 적용하지 않습니다.
- AST-008의 선별 목록에는 개별 원본·원본 격자·채택 표시 크기·수정 여부·license/고지 조건을 기록합니다. 재배포/표시 의무가 있는 에셋은 실제 배포에 필요한 고지를 연결합니다. 라이브러리 기본 폰트와 원격 폰트 import는 AST-011·AST-013으로 교체합니다.
- 현재 후보와 생성 계획은 확보된 자산을 뜻하지 않습니다. 채택할 때 기존 항목 안에 상세를 추가하며 별도 매니페스트나 출처 파일을 만들지 않습니다(D-TECH-053~054).

<br>

## 4. 운영 빌드 승인 게이트

- [ ] 상태가 `사용 승인`인지 확인
- [ ] 제작자·출처와 서비스 사용 권리 확인
- [ ] 외부 UI 코드와 실제 사용 에셋의 라이선스·고지 조건 개별 확인, 아이콘 목록·원본 격자·채택 크기 기록
- [ ] 생성 배경과 선별 CMP의 팔레트·픽셀 밀도·대비·안전 영역 통합 검증(02 §1.4)
- [ ] 실제 장면 컨테이너 크기별 전경·텍스트 안전 영역과 crop 품질 확인
- [ ] 관련 비교 시안·시각 채택 근거와 기준 원본·버전 기록
- [ ] 번들 또는 지연 로딩 위치와 용량 확인
- [ ] 자원 지연/실패가 입력·완료를 막거나 레이아웃을 밀지 않는 실기기 증거
- [ ] 늦은 자원 도착·Reduced Motion에서 연출 재시작 없음
- [ ] 대체 텍스트 또는 장식 처리 확인
- [ ] Reduced Motion과 정적 fallback 확인
- [ ] iOS·Android 실제 토스 앱에서 표시 확인
