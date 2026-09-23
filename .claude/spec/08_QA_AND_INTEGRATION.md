# ARCA QA 및 통합 검증 명세

- v1.2 · 2026-09-22 · 제품 책임자 승인 설계; 구현·실행 검증은 미착수. 중복 설명을 줄이고 선택 읽기·줄 포인터로 정리.
- 소유 범위: 검증 층·환경·명령·증거·완료 판정. 시작 상태와 기대 결과는 [.claude/spec/07_MOCK_SCENARIOS.md §11 · 약 L179–307](07_MOCK_SCENARIOS.md#11-이름-있는-시나리오-카탈로그).

## 1. 범위, 원칙과 현재 자료

### 최소 읽기 경로

처음에는 이 절과 작업에 해당하는 행만 읽습니다. 포인터는 저장소 루트 경로·제목·현재의 대략적인 줄 범위를 제공합니다. 줄이 밀리면 제목/ID를 해당 파일에서 검색합니다. 수정한 절과 이를 가리키는 줄 힌트는 함께 갱신합니다.

| 작업 | 읽을 위치 |
|---|---|
| 기능 구현·테스트 범위 선택 | [.claude/spec/08_QA_AND_INTEGRATION.md §3 · 약 L50–76](08_QA_AND_INTEGRATION.md#3-07-시나리오-실행-전략) → 필요한 07 묶음 |
| API·실서버 연결 | [.claude/spec/08_QA_AND_INTEGRATION.md §4 · 약 L78–103](08_QA_AND_INTEGRATION.md#4-계약mock실서버-동등성) → [.claude/spec/08_QA_AND_INTEGRATION.md §5 · 약 L105–111](08_QA_AND_INTEGRATION.md#5-격리-reset과-테스트-데이터) |
| 기기 보관·종료 복구 | [.claude/spec/08_QA_AND_INTEGRATION.md §6 · 약 L113–124](08_QA_AND_INTEGRATION.md#6-storage-lifecycle과-복구-검증) |
| 입력·접근성·플랫폼 | [.claude/spec/08_QA_AND_INTEGRATION.md §7 · 약 L126–138](08_QA_AND_INTEGRATION.md#7-입력-접근성-플랫폼-검증) |
| 개인정보·분석·보존 | [.claude/spec/08_QA_AND_INTEGRATION.md §9 · 약 L148–177](08_QA_AND_INTEGRATION.md#9-개인정보-분석-보안과-artifact) |
| 성능·시각 채택 | [.claude/spec/08_QA_AND_INTEGRATION.md §10 · 약 L179–194](08_QA_AND_INTEGRATION.md#10-성능-시각과-사용성) |
| 명령·실행 기록 | [.claude/spec/08_QA_AND_INTEGRATION.md §11 · 약 L196–209](08_QA_AND_INTEGRATION.md#11-환경과-명령-계약) → [.claude/spec/08_QA_AND_INTEGRATION.md §12 · 약 L211–223](08_QA_AND_INTEGRATION.md#12-결과와-증거-기록) |
| PR/merge/출시 판단 | [.claude/spec/08_QA_AND_INTEGRATION.md §13 · 약 L225–265](08_QA_AND_INTEGRATION.md#13-결함-flaky-예외와-gate) |

실제 source·lockfile·runner·CI·기기·서버/운영 환경과 실행 증거는 아직 제공되지 않았습니다. 명령·버전·실행 성공을 가정하지 않습니다. 제품 판정은 [docs/ARCA_MVP_ACCEPTANCE.md §3 · 약 L48–150](../../docs/ARCA_MVP_ACCEPTANCE.md#3-핵심-qa-시나리오), 충돌 처리는 [.claude/spec/00_INDEX.md §4 · 약 L55–76](00_INDEX.md#4-충돌-우선순위와-정정-절차)을 따릅니다.

### 1.4 결과 상태

| 상태 | 판정 |
|---|---|
| `PASS` | 선택한 필수 결과·환경이 모두 통과하고 단계에 맞는 기록이 있음 |
| `PARTIAL` | 일부 실행했지만 필수 결과/환경이 남음 |
| `FAIL` | 실제 계약 위반; rerun으로 최초 실패를 지우지 않음 |
| `BLOCKED` | 환경·권한·자료 부재로 실행 불가; 원인·담당자·해제 조건 기록 |
| `NOT_RUN` | 미실행 또는 실행 기록 없음 |

환경별로 기록하며 집계는 위반이 있으면 FAIL, 일부 실행했고 필수 범위가 남으면 PARTIAL입니다. 미실행은 원인에 따라 BLOCKED/NOT_RUN입니다. 미도입 선택 검증·중복 층은 필수 행에 넣지 않습니다. Mock·브라우저·schema 통과를 실서버·실기기·상태 전이 통과로 대신하지 않습니다.

## 2. 위험 기반 검증 층

| 층 | 담당 결과 | 추가로 확인해야 하는 실제 사실 |
|---|---|---|
| 정적/빌드 | lint·타입·금지 import·생성 drift·Mock 운영 제외 | 사용자 동작은 별도 |
| domain | 순수 문자열·시간·journal·command 클라이언트 로직 | HTTP/DOM/SDK/DB 보장 제외 |
| component+MSW | UI·입력·오류·focus와 fetch/validator 연결 | WebView·네이티브 IME/보조기술 제외 |
| browser E2E | 실제 build의 핵심 route·DOM·재진입·cache 연결 | 실제 Toss SDK·기기 조작 제외 |
| iOS/Android 기기 | Storage·IME·Back·Safe Area·lifecycle·VoiceOver/TalkBack | 서버 원자성·보존 제외 |
| 실서버/운영 | API 의미·동시성·원자 삭제·KST·CORS/TLS·보존 job | 실제 기기 UI는 별도 |

기대 결과마다 주 검증 층 하나를 정하고 다른 층은 대표 연결/환경 전용 사실만 확인합니다. component+MSW 한 실행으로 UI와 HTTP 연결을 함께 충족할 수 있습니다. coverage 비율·pixel diff·axe 결과 하나로 제품 결과나 실기기 접근성을 대체하지 않습니다.

## 3. 07 시나리오 실행 전략

### 3.1 우선순위와 기본 실행 범위

- 첫 slice는 개발용 ACTIVE 승객의 질문→작성→저장→다시 읽기입니다. `MS-CORE-001~003·005~009`를 붙이고 운영 build에는 동의/탑승 우회를 포함하지 않습니다.
- P0-core/recovery는 해당 흐름·Coordinator·Storage 구현과 동시에 검증합니다. P1은 해당 기능 변경 시, P2는 capability/장식 최초 사용 시부터 누적합니다. 관련 MVP 기능의 출시에 P1/P2도 필요합니다.
- 64개 ID는 추적 단위입니다. 여러 ID를 한 테스트로 충족할 수 있습니다. `MS-CORE-009`와 `MS-PLATFORM-003`은 공통 실행합니다.
- 고정 고위험 조합은 [.claude/spec/07_MOCK_SCENARIOS.md §12.1 · 약 L311–320](07_MOCK_SCENARIOS.md#121-base--delta--pairwise)를 적용합니다. pairwise·seeded transition·자동 축소는 선택이며 미도입/새 seed 미실행을 완료 차단 사유로 삼지 않습니다. 발견한 계약 위반은 일반 결함으로 처리합니다.

### 3.2 scenario family별 필수 층

| scenario 범위 | 주 검증 층과 결과 | 대표 연결 확인 | 실제 환경에서 추가 확인할 사실 |
|---|---|---|---|
| `MS-CORE-001~010`  [.claude/spec/07_MOCK_SCENARIOS.md §11.2 · 약 L187–202](07_MOCK_SCENARIOS.md#112-p0-핵심-질문작성저장다시-읽기) | 원문·보관 timing은 domain, 입력·저장·미확인·완료 표시는 component+MSW | 질문→저장→다시 읽기와 응답 유실 후 재진입 browser smoke | iOS/Android 입력·완료 조작, 실서버 저장·중복 방지 |
| `MS-SES-001~004`  [.claude/spec/07_MOCK_SCENARIOS.md §11.3 · 약 L204–218](07_MOCK_SCENARIOS.md#113-session탑승닉네임) | component+MSW의 bootstrap·guard·복구 결과 | 핵심 흐름 시작에 포함 | 실제 익명 키·session 복구 |
| `MS-ONB-001~003`, `MS-NICK-001~002`  [.claude/spec/07_MOCK_SCENARIOS.md §11.3 · 약 L204–218](07_MOCK_SCENARIOS.md#113-session탑승닉네임) | component+MSW의 입력·동의·실패 복구 | 탑승→첫 저장 흐름에 포함 | 정책/승객 생성 원자성·receipt, 외부 복귀·IME |
| `MS-TIME-001~003`, `MS-SEMA-001`, `MS-DRAFT-001~002`, `MS-RESULT-001`  [.claude/spec/07_MOCK_SCENARIOS.md §11.4 · 약 L220–232](07_MOCK_SCENARIOS.md#114-날짜semadraftresult-수명) | 시간·본문 복원은 domain, 만료/교체 안내는 component | 대표 만료 안내와 restart 복구 | 서버 KST·수명·종료 의미, 실제 Storage 지속성 |
| `MS-CMD-001~006`, `MS-RECEIPT-001`  [.claude/spec/07_MOCK_SCENARIOS.md §11.5 · 약 L234–248](07_MOCK_SCENARIOS.md#115-command수정두-기기) | 고정 응답 순서를 쓰는 domain의 클라이언트 상태 전이 | MSW에서 응답 유실·미확인→확정 UI 대표 case | 서버 멱등성·경쟁·ack·close, 실제 foreground 복구 |
| `MS-EDIT-001~002`, `MS-DELETE-001~002`  [.claude/spec/07_MOCK_SCENARIOS.md §11.5 · 약 L234–248](07_MOCK_SCENARIOS.md#115-command수정두-기기) [.claude/spec/07_MOCK_SCENARIOS.md §11.6 · 약 L250–262](07_MOCK_SCENARIOS.md#116-개별-삭제전체-삭제) | component+MSW의 수정·삭제·충돌 후 입력 보존 | 기록 흐름에서 수정·삭제 확인 | 두 기기 revision·삭제 결과, Dialog·키보드·Back |
| `MS-ALLDEL-001~005`  [.claude/spec/07_MOCK_SCENARIOS.md §11.6 · 약 L250–262](07_MOCK_SCENARIOS.md#116-개별-삭제전체-삭제) | 클라이언트 복구·generation 처리는 domain | component+MSW의 확인/실패/복구 UI, browser의 history/cache 부활 방지 | 서버 commit/rollback·fence·보존, 실제 clear/restart |
| `MS-LIST-001~007`, `MS-NAV-001`  [.claude/spec/07_MOCK_SCENARIOS.md §11.7 · 약 L264–277](07_MOCK_SCENARIOS.md#117-목록cursor탐색) | component+MSW의 목록 경계·오류·복귀·후보 적용 | browser에서 page 추가·깊은 scroll 복귀 대표 case | 서버 cursor·다른 기기 변경, 실제 scroll·큰 글자 |
| `MS-STORAGE-001~006`  [.claude/spec/07_MOCK_SCENARIOS.md §11.8 · 약 L279–290](07_MOCK_SCENARIOS.md#118-storage-복구) | 실제 journal 로직과 Storage fake를 연결한 domain 복구 | 복구 오류 UI와 restart 대표 case | 실제 SDK persistence·clear; 부분 쓰기 조합은 simulator에서 확인 |
| `MS-PLATFORM-001~003`  [.claude/spec/07_MOCK_SCENARIOS.md §11.9 · 약 L292–307](07_MOCK_SCENARIOS.md#119-플랫폼분석protocol) | component의 fallback·조작 결과 | `MS-CORE-009`와 자원/Reduced Motion 공통 실행 | 실제 capability·VoiceOver/TalkBack·키보드·Safe Area |
| `MS-ANALYTICS-001~002`, `MS-PRIVACY-001`  [.claude/spec/07_MOCK_SCENARIOS.md §11.9 · 약 L292–307](07_MOCK_SCENARIOS.md#119-플랫폼분석protocol) | queue는 domain, allowlist/전송은 MSW, sink 검사는 기존 핵심·오류 실행에 부착 | 별도 전체 흐름 대신 기존 실행의 sink와 production build 검사 | 서버 dedupe·보존, 실제 사용 중인 native/proxy/APM/Sentry sink |
| `MS-PROTOCOL-001~002`  [.claude/spec/07_MOCK_SCENARIOS.md §11.9 · 약 L292–307](07_MOCK_SCENARIOS.md#119-플랫폼분석protocol) | MSW의 validator·오류 정규화 | component에서 입력 보존·오류 안내 대표 case | 실서버 response·error registry 호환 |

같은 assertion을 domain·component·MSW 각각에 복제하지 않습니다. 대표 연결은 기존 흐름에 합치며 행마다 E2E를 만들지 않습니다. 기기에서는 합성 장애의 모든 순서를 반복하지 않습니다. 서버 전용 사실을 확인할 fault hook/감사 가능한 대체 관찰이 없으면 해당 항목만 BLOCKED입니다.

## 4. 계약·Mock·실서버 동등성

### 4.1 계약 검증

wire/생성기 기준: [.claude/spec/05_API_SPEC.md §15.2 · 약 L801–805](05_API_SPEC.md#152-기계-판독-계약의-재현-검증); 호환성: [.claude/spec/05_API_SPEC.md §7.6 · 약 L494–502](05_API_SPEC.md#76-wire-호환성); 오류 registry: [.claude/spec/05_API_SPEC.md §8.2 · 약 L512–546](05_API_SPEC.md#82-안정-오류-registry).

하나의 고정 버전 contract command로 구조/내부 ref·OP 연결/보안·정상/거절 예시·파생 type/validator drift·Mock/실제 response validation을 확인합니다. 호환 추가 field는 허용하고 필수 field·타입/날짜/nullability·필수 enum·빈 body 오류는 ProtocolFailure로 정규화합니다. 닫힌 error/event allowlist의 추가값은 거절하며 raw body/message를 노출하지 않습니다. HTTP/timeout/5xx/조회 부재를 command 미적용으로 바꾸지 않습니다.

### 4.2 API-V-001~027 실행 의무

원본 정의: [.claude/spec/05_API_SPEC.md §15 · 약 L763–805](05_API_SPEC.md#15-계약-검증-추적). 클라이언트 반응은 07의 해당 API-V 행, 서버 보장은 아래 담당 결과로 확인합니다. Mock에 DB/worker를 재구현하거나 양쪽 adapter에서 같은 결과를 반복하지 않습니다.

| API-V | 실서버에서 확인할 결과 |
|---|---|
| 001~004 | 익명 session·미생성/원자 생성·정책·nickname receipt/revision |
| 005~010 | KST 수락·원문 보존·단일 효과·응답 유실 복구·표시 독립 |
| 011~016 | 두 기기 revision·cursor·수정/삭제·발췌·삭제 transaction |
| 017~019 | 실제 로그/분석/cache sink·오류/validator 호환 |
| 020~023 | prepare/execute/close/ack 경쟁·같은 key 복구·다른 기기 proof |
| 024~027 | 콘텐츠 교체·RESOURCE_CHANGED·결과 수명·worker/fence/commit |

관찰이 공유되는 경우 같은 assertion ID를 연결합니다. 실서버는 공개 결과·후속 safe query·허용 감사 증거로 판정하며 Mock 내부 state는 증거가 아닙니다. 대체 관찰의 한계는 결과에 남깁니다.

### 4.3 단일 수락 비교의 분리

비교를 수행할 때만 [.claude/spec/05_API_SPEC.md §16 · 약 L807–819](05_API_SPEC.md#16-저장-요청-분할-비교와-상태-전이-검증)을 읽습니다. 같은 입력·지연·fault 조건에서 지연/왕복·수락 날짜·복구 부담을 별도로 기록합니다. 비교 통과는 운영 계약 변경 승인이 아닙니다.

## 5. 격리, reset과 테스트 데이터

- 테스트마다 사용한 fixture/handler·Clock·Storage fake를 초기화합니다. MSW history/handler를 복원하고 browser context/cache/service worker/영속 상태를 격리합니다. SDK Storage와 browser storage는 구분합니다.
- reset/restart/reload 의미는 [.claude/spec/07_MOCK_SCENARIOS.md §4.3 · 약 L82–91](07_MOCK_SCENARIOS.md#43-resetrestartreload)를 따릅니다. 사용하지 않는 world/runtime을 만들지 않습니다.
- 기기·서버는 합성 전용 주체/build를 사용합니다. 서버 데이터는 run별 격리하고 불가능하면 병렬 실행을 막습니다. 실제 사용자·운영 콘텐츠/credential을 쓰지 않습니다.
- 서버 실행 전 safe subject alias·생성/정리 수단을 설정합니다. assertion/후속 query 뒤 전체 삭제 검증은 제품 삭제 흐름으로, 나머지는 제공된 합성 데이터 cleanup으로 정리하고 성공을 확인합니다.
- cleanup 실패는 PARTIAL/FAIL과 담당자·재시도 방법을 남깁니다. 존재하지 않는 admin API를 가정하거나 넓은 환경을 삭제하지 않습니다. 재현에는 fixture recipe/ID를 남기고 서버 합성 본문은 정리합니다.

## 6. Storage, lifecycle과 복구 검증

자동 고정 case는 [.claude/spec/07_MOCK_SCENARIOS.md §7 · 약 L130–150](07_MOCK_SCENARIOS.md#7-storage와-앱-lifecycle)와 [.claude/spec/07_MOCK_SCENARIOS.md §11.8 · 약 L279–290](07_MOCK_SCENARIOS.md#118-storage-복구)를 실행합니다. A/B 손상·pending/ready·동시 metadata·proof/cleanup/ack 중단·삭제 후 old write·clear 실패의 기대 결과를 재작성하지 않습니다.

iOS·Android에서 실제 확인할 항목:

- 정상 set/read/read-back/remove/clear와 reload·background/foreground·강제 종료 뒤 지속성.
- IME 중 background, write 대기 중 종료, 저장 결과 조회 중 종료/재실행의 입력·요청 복구.
- 저장 응답 유실 뒤 같은 command 확인, 전체 삭제 뒤 local 정리·재탑승·이전 데이터 부활 방지.
- quota/reject/read-back 불일치를 실제로 재현할 수 있는 범위와 한계.

모든 journal checkpoint·부분 쓰기 조합은 simulator에서 확인합니다. 실제 기기의 persistence/대표 복구와 합쳐 판정하며 한쪽만으로 전체 Storage 통과를 주장하지 않습니다.

## 7. 입력, 접근성, 플랫폼 검증

입력 corpus: [.claude/spec/07_MOCK_SCENARIOS.md §3.5 · 약 L61–74](07_MOCK_SCENARIOS.md#35-합성-콘텐츠와-민감정보); 입력/IME 기준: [.claude/spec/04_INTERACTIONS_AND_COPY.md §4.1 · 약 L61–79](04_INTERACTIONS_AND_COPY.md#41-입력ime문자-수--ix-001ix-002); Back/focus: [.claude/spec/04_INTERACTIONS_AND_COPY.md §5.7 · 약 L174–195](04_INTERACTIONS_AND_COPY.md#57-back키보드포커스--ix-017ix-018).

| 항목 | 자동/대표 연결 | 실제 기기 확인 |
|---|---|---|
| 닉네임·응답 | 닉네임 1/2/12/13, 응답 1/2,000/2,001 EGC·공백/개행·붙여넣기·초과 비절단·오류 해제 | 한글/일본어 IME, 키보드 가림, 긴 글 중간 cursor/selection |
| 320px·200%·작은 높이 | reflow·중첩·단일 저장 control·bar 전환 시 입력/scroll/focus | 시스템 큰 글자·키보드에서도 질문→입력→저장 |
| 접근성 | axe·role/name·대비·타깃·단일 live source | VoiceOver/TalkBack으로 핵심 흐름·삭제 확인·오류 복구, 읽기/발표/focus |
| Overlay·Back | trap/닫힘 잠금/복귀 | Dialog→Overlay→키보드→보관 조건에 따른 이탈→부모/root, 외부 정책/고객센터 복귀 |
| capability | Clipboard SDK→표준 API→직접 선택, 자원 실패·Reduced Motion | 실제 Clipboard·Safe Area·익명 키·Storage·Back·haptic |

network/time hint·haptic/장식 실패는 날짜 판정·저장·이동을 바꾸지 않습니다. Safe Area 변화는 입력/scroll/focus를 보존합니다. 실제 읽기·발표·제스처는 자동 검사로 대체하지 않습니다.

## 8. Query, 목록과 동시성

선택 case와 기대 결과: [.claude/spec/07_MOCK_SCENARIOS.md §11.7 · 약 L264–277](07_MOCK_SCENARIOS.md#117-목록cursor탐색), [.claude/spec/07_MOCK_SCENARIOS.md §11.5 · 약 L234–248](07_MOCK_SCENARIOS.md#115-command수정두-기기), [.claude/spec/07_MOCK_SCENARIOS.md §11.6 · 약 L250–262](07_MOCK_SCENARIOS.md#116-개별-삭제전체-삭제).

- 목록/count 성공·실패 네 조합, 0/1/2/20/21·월/연도·cursor 무효·후보 적용은 빠른 층에서 확인합니다.
- browser/기기는 deep scroll·anchor/focus·큰 글자 등 연결만 추가합니다.
- 실서버는 두 기기 revision 충돌·ALREADY_ABSENT·receipt 이후 변경·ack 후 proof 복구·삭제 fence 뒤 mutation/worker 차단을 확인합니다. 필요한 선후 순서를 고정하고 우연한 timing에 기대지 않습니다.

## 9. 개인정보, 분석, 보안과 artifact

### 9.1 canary와 캡처 허용

역할별 합성 canary를 기존 핵심·오류·삭제 실행에 붙입니다. 실제 사용하는 sink만 검사하고 미사용 도구는 검증용으로 설치하지 않습니다. 원본 경계: [.claude/spec/05_API_SPEC.md §12 · 약 L695–717](05_API_SPEC.md#12-개인정보보안로그-계약).

| 구분 | 기준 |
|---|---|
| 허용 UI 증거 | 의도된 화면의 중립 합성 질문·답변·닉네임을 보호된 screenshot/video/DOM snapshot/trace 화면에 포함 가능 |
| 캡처 금지 | token·익명 키·내부 식별자·raw request/response·Storage value; trace/HAR 수집을 끄거나 업로드 전 제거 |
| 금지 sink | URL/history/referrer, console/logger/test diff·이름/stdout, analytics·오류/Sentry/breadcrumb/Replay, proxy/gateway/WAF/APM/cache/CDN, devtools/개발 패널/Clipboard 오류 |

UI 합성 문장도 로그·분석·오류로 유출되면 FAIL입니다. artifact의 금지값은 제한/redaction하고 허용된 합성 UI 검출만으로 실패 처리하지 않습니다. 원문은 허용된 UI·메모리·저장·통신 경로에서만 사용합니다.

### 9.2 분석·보존

분석 source/allowlist·중복·queue/flush는 [.claude/spec/07_MOCK_SCENARIOS.md §11.9 · 약 L292–307](07_MOCK_SCENARIOS.md#119-플랫폼분석protocol), 소유 계약은 [.claude/spec/05_API_SPEC.md §11 · 약 L640–693](05_API_SPEC.md#11-제품-이벤트-계약)을 따릅니다. 전송 실패가 화면을 막거나 입력을 반사하면 실패입니다.

| 출시 전 실제 증거 | 확인할 것 |
|---|---|
| 원자 삭제 | commit/rollback·safe query·worker fence |
| 동의 증빙 1년 | 분리 저장·접근 통제·TTL/job와 합성 만료 probe |
| backup 최대 30일 | 만료 정책·삭제 대상의 복구 제외 |
| raw analytics 90일·오류 30일 | 실제 retention/job·최근 실행·합성 aged row/삭제 표본 |

설정 화면만으로 실제 삭제/보존을 PASS로 하지 않습니다. 필요한 설정/job 접근이 없으면 해당 항목은 BLOCKED입니다.

### 9.4 테스트 artifact 보호

결과는 ID·safe alias·안정 error code·assertion 요약을 기본으로 남깁니다. 캡처/trace는 실패 재현·출시 확인에 필요할 때만 수집하고 업로드할 artifact의 금지값을 검사합니다. 검출되거나 자동 판별이 어려운 경우만 수동 redaction합니다. 공통 CI 접근/보존/삭제 정책은 한 번 기록하고 출시에서 참조합니다. 공개 comment에는 안전한 요약/보호 link만 두며 credential 값·일부·hash는 기록하지 않습니다.

## 10. 성능, 시각과 사용성

출시 임계값 원본: [docs/ARCA_MVP_ACCEPTANCE.md §2 · 약 L35–46](../../docs/ARCA_MVP_ACCEPTANCE.md#2-품질-목표). 추가 숫자를 임의 gate로 만들지 않습니다.

| 목표 | 측정 |
|---|---|
| 저장 2초, 주요 전환의 이유 없는 2초 이상 대기 없음 | 실제 기기+production-like 서버의 조작→확정 UI monotonic 표본·조건·위반 건수; p50/p95는 참고 |
| 실행→SEMA 60초, 질문→입력 30초 | cold start·탑승/재방문에서 조작 가능 시점 |
| 저장 성공률 99.5% | terminal 결과의 분모·기간·환경; 출시 전 결과와 운영 지표를 구분 |
| 입력 유실 0건 | 실패/종료/복구의 원문 hash·EGC·줄 구조 비교 |
| 도움 없이 첫 저장 80% | 실제 기기 과업·도움 기준·참가자/성공 수 |
| 치명 오류 0건 | 열린 S0/S1과 출시 blocker 집계 |

첫 slice부터 cold start·긴 입력/IME 반응·layout shift·JS/CSS/font/image 전송량·중복 runtime/CSS·단일 저장 bar의 입력/focus 보존을 측정합니다. 같은 build/기기/network/입력/warm-cold 조건으로 비교하고 예산은 baseline과 제품 책임자 채택 뒤 반영합니다. 운영 표본이 없으면 모니터링 계획을 남기며 운영 달성으로 표시하지 않습니다.

CMP/생성 배경의 상태·320px·200%·키보드·자원 실패·Reduced Motion·권리/출처·production 비용은 [docs/ARCA_MVP_ACCEPTANCE.md · 약 L146–150](../../docs/ARCA_MVP_ACCEPTANCE.md#픽셀-ui-선별-도입의-사용자-결과)와 [.claude/spec/06_FRONTEND_SPEC.md §2.4 · 약 L97–117](06_FRONTEND_SPEC.md#24-픽셀-ui-선별-도입과-출처-추적)의 결과를 확인합니다. pixel diff만으로 입력/조작 결과를 대신하지 않습니다.

## 11. 환경과 명령 계약

실제 package/lockfile/CI가 생기면 아래 역할의 확인된 명령을 package script/CI에 연결합니다. 현재 구체 명령은 미제공·BLOCKED이며 임의로 만들지 않습니다. 역할을 합친 script도 허용하고 고정 lockfile을 사용합니다.

| 역할 | 확인할 결과 |
|---|---|
| lint/typecheck/build | Biome·strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes·no emit, Mock 운영 제외·bundle/source map/asset |
| domain/component/a11y | 선택한 고정 회귀·RTL/user-event/axe·입력/focus·복구 |
| contract/MSW | schema/ref/예시·파생 drift·validator·HTTP/오류/응답 유실 |
| browser | Chromium/WebKit 핵심 연결·재진입 |
| 기기 | QR/sandbox iOS·Android·SDK/보조기술·lifecycle |
| 실서버/운영 | 합성 data setup/cleanup·API-V·CORS/TLS·sink/retention/backup |

local/MSW·Devtools는 SDK·DB·CORS/TLS의 실제 증거가 아닙니다. 실서버는 합성 sandbox, 성능/연결은 staging/production-like에서 확인합니다. 운영 점검은 승인된 제한 작업·합성 canary만 사용하고 secret 없는 CI job에서 배포/기기 작업을 하지 않습니다.

## 12. 결과와 증거 기록

### 12.2 일상 기록과 출시 manifest

| 단계 | 필요한 기록 |
|---|---|
| 일상/PR/merge | 기존 runner/CI의 테스트명 또는 ID·결과·commit/dirty; 실패 시 assertion·재현 순서·rerun, 생성 case만 seed |
| 출시 | release/app/server build, suite/ID와 API-V/Acceptance 연결, 명령/lockfile/CI, browser 또는 기기/OS/Toss/SDK, 안전한 서버 환경 alias, 결과/증거 link, cleanup, 열린 결함/예외 |
| 수동 기기 | 기존 절차/ID·기기·결과·필요 관찰/결함; 접근성은 읽기/발표/focus, 출시에는 실행자/build |

명령·도구 버전·환경은 기존 설정을 링크하고 환경별 공통 정보는 한 번 기록합니다. 일상 성공에 별도 manifest·screenshot·수동 검토를 요구하지 않습니다. 실패 재현에 영향을 주는 clock/network/lifecycle·server build만 추가합니다. 기기/SDK/build가 바뀌면 영향 범위를 재실행합니다.

대용량 증거는 보호된 artifact store에 두고 필요한 출시 요약/link만 저장소에 둡니다. 파일 구조·테스트명 형식은 실제 template에 맞추며 사용자 원문·raw ID/token을 파일명에 넣지 않습니다. screenshot 하나로 상태 전이·원자성·민감정보 부재를 증명하지 않습니다.

## 13. 결함, flaky, 예외와 gate

### 13.1 심각도와 차단

| 심각도 | 기준 | 처리 |
|---|---|---|
| S0 | 실제/잠재 데이터 유실·삭제 누락/부활·노출·인증/generation 경계 우회 | merge/release 차단, 출시 예외 불가 |
| S1 | 핵심 흐름 불가·저장 결과 오판·주요 접근성 불가·실서버 비호환 | merge/release 차단 |
| S2 | 복구 가능한 비핵심 회귀·수락 기준 일부 위반 | 영향과 출시 범위로 명시 판정 |
| S3 | 제품 결과를 바꾸지 않는 경미한 시각/문서/진단 | 추적·제한적 예외 가능 |

심각도와 무관한 출시 차단: 필수 시나리오/API-V/Acceptance FAIL, 필수 기기·보조기술·Storage/Back/Safe Area 미확인, 삭제/fence/보존 증거 부재, 금지 sink 유출/점검 불가, 운영 Mock/우회 포함, 실제 정책/고객센터/SEMA/API/CORS/TLS 미연결, 만료된 예외.

### 13.2 flaky와 예외

최초 실패와 재현 정보를 보존하고 같은 조건으로 진단합니다. rerun으로 실패를 덮거나 무제한 retry/timeout 증가/assertion 삭제로 통과시키지 않습니다. P0/API-V·개인정보·삭제·유실·핵심 접근성은 quarantine으로 우회할 수 없습니다.

비차단 quarantine/예외는 범위·이유/위험·영향 기준·대체 증거·담당자·승인자/승인일·만료일·후속 작업을 기록합니다. 만료 시 차단으로 돌아갑니다. 제품/API/개인정보 의미 변경은 담당 SSOT에서 처리하며 S0·민감정보 노출은 예외 대상이 아닙니다.

### 13.4 PR gate

- 코드: lint/typecheck·Mock 운영 경계, 변경 결과의 주 검증 층과 관련 P0 회귀.
- wire 변경: contract/generated drift·MSW contract; 사용자 흐름 변경: 관련 browser smoke·axe.
- 일상 결과/실패 재현·관련 sink 검사; artifact 업로드 시 금지값 검사.
- 문서만 변경: 변경된 경로·줄 힌트·ID·추적 확인. 앱 실행/build/manifest 불필요.

### 13.5 merge gate

P0-core와 구현된 P0-recovery 고정 회귀, 변경 영역 P1/P2·핵심 browser smoke, contract drift 없음·production Mock 제외, 열린 S0/S1 없음·유효한 예외/flake 처리, commit/build 결과 연결을 확인합니다. 같은 commit/환경의 PR 결과는 재사용합니다.

### 13.6 release-candidate gate

- 64개 ID와 고위험 고정 조합·API-V-001~027이 담당 층/실제 환경 결과에 연결됨. 공통 테스트 재사용 가능, 생성 검증은 선택.
- 실제 iOS/Android 핵심·복구, VoiceOver/TalkBack, 320px·200%·키보드·Reduced Motion 통과.
- 원자 삭제·local clear/recentDeletion·새 generation 보호, privacy sink·분석·retention/backup 증거.
- 저장/첫 경험/유실/사용성/성공률의 현재 단계 증거, 시각 채택·출처/권리·production 비용, 운영 Mock 부재.
- 법무/고객센터/SEMA/API/CORS/TLS 연결, 직전 안정 build와 rollout/rollback·출시 후 모니터링 준비.

### 13.7 release gate

candidate 필수 행이 모두 PASS이며 [docs/ARCA_MVP_ACCEPTANCE.md §4 · 약 L152–195](../../docs/ARCA_MVP_ACCEPTANCE.md#4-출시-승인-체크리스트)에 증거가 연결돼야 합니다. 승인자는 열린 결함/예외·운영 증거·rollout/rollback·모니터링을 검토합니다. 같은 candidate/환경 결과는 재사용하고 PARTIAL/BLOCKED/NOT_RUN을 완료로 해석하지 않습니다.

## 14. 추적과 완료 판정

구현 순서: [.claude/spec/06_FRONTEND_SPEC.md §12 · 약 L666–683](06_FRONTEND_SPEC.md#12-구현-순서). slice는 선택한 주 검증 층·대표 연결·필요한 실패/접근성/개인정보/실기기 결과를 갖추고 일상 기록에 ID·계약·남은 blocker를 연결하면 완료입니다. 필수 범위가 남으면 PARTIAL, 선택 검증 미도입은 차단 사유가 아닙니다.

전체 완료는 release gate 통과로 판정합니다. Acceptance별 원문은 [docs/ARCA_MVP_ACCEPTANCE.md §3 · 약 L48–150](../../docs/ARCA_MVP_ACCEPTANCE.md#3-핵심-qa-시나리오), 해당 시나리오는 [.claude/spec/07_MOCK_SCENARIOS.md §11 · 약 L179–307](07_MOCK_SCENARIOS.md#11-이름-있는-시나리오-카탈로그)의 `Acc #`로 찾습니다. 별도 중복 추적표나 완료 체크리스트를 만들지 않습니다.
