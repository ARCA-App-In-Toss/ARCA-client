# ARCA Mock 시나리오 명세

- v1.6 · 2026-09-30 · 제품 책임자 승인 설계; 로컬 Mock 구현·회귀 실행 증거는 08 §14.1, 실서버·실기기는 별도 미검증.
- 소유 범위: 합성 시작 상태·장애·사건 순서·기대 결과. 실행 방법과 완료 판정은 [.claude/spec/08_QA_AND_INTEGRATION.md §3 · 약 L50–76](08_QA_AND_INTEGRATION.md#3-07-시나리오-실행-전략).

## 1. 범위와 권위

### 최소 읽기 경로

처음에는 이 절과 해당 시나리오 묶음만 읽습니다. 상세 규칙은 구현 중 필요한 항목만 엽니다. 경로는 저장소 루트 기준이며 링크는 문서 상대 경로입니다. `약 L…`는 현재 위치 힌트입니다. 줄이 밀리면 같은 제목·ID를 해당 파일에서 검색하고 주변만 읽습니다. 수정한 절과 이를 가리키는 줄 힌트는 함께 갱신합니다.

| 작업 | 읽을 위치 |
|---|---|
| Mock 처음 연결 | [.claude/spec/07_MOCK_SCENARIOS.md §2 · 약 L27–37](07_MOCK_SCENARIOS.md#2-mock-세계와-책임-경계) → [.claude/spec/07_MOCK_SCENARIOS.md §3 · 약 L39–76](07_MOCK_SCENARIOS.md#3-fixture-모델) → [.claude/spec/07_MOCK_SCENARIOS.md §11.2 · 약 L189–204](07_MOCK_SCENARIOS.md#112-p0-핵심-질문작성저장다시-읽기) |
| 탑승·세션·닉네임 | [.claude/spec/07_MOCK_SCENARIOS.md §11.3 · 약 L206–220](07_MOCK_SCENARIOS.md#113-session탑승닉네임) |
| 저장·날짜·결과 복구 | [.claude/spec/07_MOCK_SCENARIOS.md §11.4 · 약 L222–234](07_MOCK_SCENARIOS.md#114-날짜semadraftresult-수명) → [.claude/spec/07_MOCK_SCENARIOS.md §11.5 · 약 L236–250](07_MOCK_SCENARIOS.md#115-command수정두-기기) |
| 삭제·기기 보관 | [.claude/spec/07_MOCK_SCENARIOS.md §11.6 · 약 L252–264](07_MOCK_SCENARIOS.md#116-개별-삭제전체-삭제) → [.claude/spec/07_MOCK_SCENARIOS.md §11.8 · 약 L281–292](07_MOCK_SCENARIOS.md#118-storage-복구) |
| 목록·탐색 | [.claude/spec/07_MOCK_SCENARIOS.md §11.7 · 약 L266–279](07_MOCK_SCENARIOS.md#117-목록cursor탐색) |
| 플랫폼·개인정보·오류 | [.claude/spec/07_MOCK_SCENARIOS.md §11.9 · 약 L294–309](07_MOCK_SCENARIOS.md#119-플랫폼분석protocol) |
| 검증 층·실행 범위 선택 | [.claude/spec/08_QA_AND_INTEGRATION.md §3 · 약 L50–76](08_QA_AND_INTEGRATION.md#3-07-시나리오-실행-전략) |
| 기록·완료 판정 | [.claude/spec/08_QA_AND_INTEGRATION.md §12 · 약 L228–240](08_QA_AND_INTEGRATION.md#12-결과와-증거-기록) → [.claude/spec/08_QA_AND_INTEGRATION.md §13 · 약 L242–282](08_QA_AND_INTEGRATION.md#13-결함-flaky-예외와-gate) |

카탈로그의 `OP-*`는 [.claude/spec/05_API_SPEC.md §3 · 약 L104–124](05_API_SPEC.md#3-오퍼레이션-인벤토리), `API-V-*`는 [.claude/spec/05_API_SPEC.md §15 · 약 L787–829](05_API_SPEC.md#15-계약-검증-추적), `Acc #`는 [docs/ARCA_MVP_ACCEPTANCE.md §3 · 약 L48–150](../../docs/ARCA_MVP_ACCEPTANCE.md#3-핵심-qa-시나리오)의 ID입니다. `API-V-022` 또는 `#39`처럼 개별 ID로 검색할 수 있고 링크의 줄 힌트는 필요한 원본 행만 가리킵니다. 화면·문구 원문은 묶음별 구현/상호작용 포인터에서 필요한 경우만 따라갑니다.

제품/API 의미는 원본 담당 문서가 우선합니다. 충돌 절차: [.claude/spec/00_INDEX.md §4 · 약 L57–78](00_INDEX.md#4-충돌-우선순위와-정정-절차). 이 문서는 새 API·화면 정책을 만들지 않습니다.

## 2. Mock 세계와 책임 경계

- 고정 fixture와 명시적 응답 순서로 시작합니다. 재시도·수정·삭제에 필요한 상태만 추가합니다.
- 서버 상태만 기기 간 공유합니다. 기기별 session·Storage·cache·tracker·analytics queue·platform fake는 독립입니다.
- HTTP 연결은 MSW, 순수 클라이언트 로직은 fake port를 사용합니다. 모든 시나리오에 두 adapter를 구현하지 않습니다.
- 범용 server simulator·scheduler·fault engine·개발 패널은 선택 사항입니다. 서버 원자성·worker·DB 보장을 Mock에 재구현하지 않습니다.
- 같은 fixture·기대 결과를 재사용하되 테스트와 adapter 비교 실행 사이의 가변 상태는 공유하지 않습니다.

### 2.4 최소 구현 배치

`src/mocks/` 안에 scenario 목록·fixture·handler·필요한 fake/reset helper만 둡니다. 폴더 분리는 선택입니다. Mock은 dev build에서 `VITE_ARCA_MOCK_SCENARIO`가 있을 때만 동적 import로 시작합니다. production entry에는 Mock import·selector·동의/탑승 우회가 없어야 하며 production bundle 검사가 Mock 표식 부재를 확인합니다.

## 3. Fixture 모델

### 3.1 정상 base와 타입 있는 delta

| base | 시작 의미 |
|---|---|
| `server.prePassenger` | 유효한 미등록 합성 주체, 현재 필수 정책, 승객·답변 없음 |
| `server.activeUnanswered` | ACTIVE 합성 승객, 현재 generation, 오늘 정상 SEMA, 오늘 답변 없음 |
| `server.activeAnswered` | ACTIVE 합성 승객, 오늘 저장 답변 1개와 일치하는 snapshot·count |
| `device.clean` | 현재 session 외 private cache·Storage record·tracker 없음 |
| `device.recoverableDraft` | 유효 A/B metadata와 exact read-back이 확인된 합성 draft |
| `platform.nominal` | 필요한 capability 사용 가능, 지연·거절 없음, foreground |

server base는 `ServerBase` 이름으로, device·platform base는 fake Storage·Platform의 기본값과 옵션으로 표현합니다. 변형은 답변 수·날짜·revision·Storage 실패 등 의미가 드러나는 값으로 지정합니다. 임의 deep merge로 모순을 만들지 않습니다. opaque ID는 합성 고정값/결정적 builder로 만들고 민감값 대신 safe alias를 표시합니다.

### 3.2 명시할 값과 불변식

- 사건의 날짜·수락/완료 시각, expected/source revision, SEMA 교체 전후 identity, command 상태·기한, 기기별 사건 순서와 장애 지점은 직접 명시합니다.
- 관련 fixture만 검사합니다: 하루 활성 답변 최대 1개, snapshot·원문 보존, terminal 비역행, stale mutation 미적용, revision·generation 일치, cursor의 owner/generation/첫 page 상한.
- domain 거절은 일관된 fixture에 거절될 요청을 보냅니다. malformed 응답은 전달 경계 한 곳만 손상하고 정상 fixture에 validation 우회를 섞지 않습니다.
- API 불변식: [.claude/spec/05_API_SPEC.md §2.2 · 약 L66–79](05_API_SPEC.md#22-핵심-불변식); 호환성/오류: [.claude/spec/05_API_SPEC.md §7.6 · 약 L516–524](05_API_SPEC.md#76-wire-호환성) 및 [.claude/spec/05_API_SPEC.md §8.2 · 약 L534–568](05_API_SPEC.md#82-안정-오류-registry).

### 3.5 합성 콘텐츠와 민감정보

F03·F11·F22·F30의 한글 조합 중 1→2글자, 조합 자모 변화, 결합 이모지 1 EGC, 상한을 넘나드는 입력을 검증합니다. blur/`compositionend` 전에도 표시 카운터는 현재 값과 같아야 하며 오류·저장 요청·임시 보관 commit은 앞당기지 않습니다. F20에는 합성 응답도 목록에 노출하지 않고 해당 질문을 선택한 F21에서 원문을 검증합니다.

중립 합성 질문·응답·닉네임만 사용하고 `synthetic/non-user`로 표시합니다. 실제 사용자·운영 콘텐츠·키·token·식별자·외부 저작물을 복사하지 않습니다.

| corpus | 검증 의미 |
|---|---|
| 1 EGC, 짧은 문장, 정확히 2,000 EGC, 2,001 EGC | 하한·상한·초과 원문 유지 |
| 앞뒤 공백, 공백만, 연속 공백 | trim·축약 금지 |
| 연속 빈 줄, CR/LF 입력 표현 | 논리적 줄과 원문 왕복 |
| 결합 이모지·피부색 modifier·ZWJ sequence·combining mark | EGC 경계 |
| 발췌 경계 직전·정확 경계·경계 초과 | COMPACT/STANDARD/EXPANDED prefix와 생략 표시 |
| 매우 긴 질문·짧은 질문 | 질문 전문/일부 표시와 reflow 입력 |

긴 문자열은 구성 규칙·기대 EGC 수를 고정합니다. 입력은 실제 text node로 표시합니다. UI 캡처와 금지 sink 구분: [.claude/spec/08_QA_AND_INTEGRATION.md §9 · 약 L148–177](08_QA_AND_INTEGRATION.md#9-개인정보-분석-보안과-artifact).

## 4. 시나리오 식별·선택·초기화

- ID는 `MS-{FAMILY}-{NNN}`; 비호환 의미 변경 시 새 ID, fixture/사건 순서 변경 시 definition version을 올립니다. ID를 재사용하지 않습니다.
- 선택 가능한 시나리오 목록은 `src/mocks/scenarios.ts` 하나이며 dev 시작과 browser project가 공유합니다. 선택 key는 MS ID 또는 `MS-…-{variant}`입니다. 카탈로그 밖 개발용 key(`demo` 등)는 새 MS ID를 만들지 않습니다. 단위·component 테스트는 base fixture로 world를 직접 만들 수 있습니다.
- scenario ID·seed·fault cursor를 URL·history·cookie·사용자 profile·SDK Storage에 넣지 않습니다. 개발 시작 설정은 운영 build에서 거부합니다.

### 4.3 reset·restart·reload

| 조작 | 공유 서버 | 해당 기기 Storage | 해당 기기 메모리 | 시계·fault cursor |
|---|---|---|---|---|
| `Reset scenario` | baseline으로 재생성 | 모든 합성 기기 baseline으로 재생성 | 재생성 | definition 시작점으로 복귀 |
| `Restart device` | 유지 | 확인된 값 유지 | token·cache·navigation·in-flight delivery 제거 | server 시간 유지, 기기 lifecycle 재시작 |
| 화면 reload/app cold start | 유지 | 유지 | composition root부터 재구성 | 현재 runtime 시각·fault 상태 유지 |
| 새 자동 테스트 | 새 인스턴스 | 새 인스턴스 | 새 인스턴스 | 새 인스턴스 |

미확인 write나 종료 직전 best-effort write를 성공으로 바꾸지 않습니다. 서버에 도착한 요청은 기기 종료 뒤에도 지정 단계까지 진행할 수 있습니다.

## 5. 가상 시간과 scheduler

server UTC/KST는 날짜·수락·기한 판정, 기기 wall clock은 로컬 만료, monotonic 시간은 debounce·timeout에만 사용합니다. 기기 시각 역행은 draft 조기 삭제를 막도록 마지막 관찰 시각으로 clamp합니다.

| 계약 | 시작 사건 | 경계 관찰 |
|---|---|---|
| draft trailing 500ms | composition이 끝난 마지막 변경 | 499ms에는 미실행, 500ms에 최신 version 예약 |
| draft maxWait 2초 | 최초 미보관 완료 변경 | 계속 입력해도 2초에 최신 완료 입력 예약; IME 중이면 compositionend 직후 |
| safe query transport 최대 8초 | 실제 transport 시작 | timeout은 결과 부재일 뿐 command 미적용 증거가 아님 |
| safe query transport retry 최대 1회 | 연결성 오류 | 같은 query 의미로 한 번만; command 자동 재실행과 구분 |
| foreground 결과 확인 최대 10초 | 저장/삭제 또는 명시적 재확인 | 즉시·약 1초·3초·7초 후보, 10초 뒤 정적 미확인 |
| background | lifecycle 전환 | FE 자동 timer·poll 후보 정지; server 처리 결과를 취소하지 않음 |
| draft 7일 | 마지막 사용자 본문 수정 | 열람·조회·repair로 연장하지 않음 |
| result 7일 | terminal `completedAt` | ack와 무관하게 최소 proof/error 보존, 이후 봉인/정리 경로 |
| token·execute deadline | fixture가 명시한 server field | 운영 수치를 가정하지 않고 field 직전·정확 경계·직후로 검사 |

fake timer·수동 Promise·handler 순서로 필요한 사건만 진행합니다. 시간 이동으로 모든 queue를 완료하지 않습니다. 자정·SEMA 교체·7일 만료의 결과는 해당 카탈로그 행에서 확인합니다.

## 6. Network·API fault script

fault는 OP·의미 단계·필요한 재시도/기기에 연결하고 소비 횟수를 명시합니다. 전체 네트워크의 N번째 호출에 연결하지 않습니다. 미소비 필수 fault·추가 mutation은 실패입니다.

| milestone | 서버 효과 | 대표 fault |
|---|---|---|
| client dispatch 전 | 요청 없음 | offline 감지, local persistence 실패, 사용자 Abort |
| 전송됐으나 server 미도착 | 효과 없음 | connection drop, DNS/transport timeout |
| server 도착·영속 수락 전 | 해당 요청 효과 없음 | 429·503·인증된 4xx, 수락 전 500/연결 종료 |
| prepare 영속 수락 | PREPARED/ticket 존재 | prepare 응답 유실·지연·malformed |
| execution payload 영속 수락 | EXECUTING 가능, payload 고정 | execute 응답 유실·지연 |
| terminal commit | SUCCEEDED 또는 NOT_APPLIED 불변 | commit 뒤 응답 유실·앱 종료 |
| response 전달 | client가 관찰 가능 | late response, old epoch/generation 적용 차단 |

- timeout·response 유실·parse 실패·Abort·화면 이탈·조회 부재는 서버 미적용/취소 증거가 아닙니다.
- `SESSION_RECOVERY_REQUIRED`와 `recoveryAllowed: true`에서만 session 재교환 후 같은 행동을 최대 1회 재요청합니다.
- 정상 token 갱신은 같은 주체/generation의 확인본을 유지합니다. 주체·권한·generation 변경은 과거 상태와 자동 재시도를 폐기합니다. old epoch/generation 응답은 적용하지 않습니다.
- 안정 오류는 [.claude/spec/05_API_SPEC.md §8.2 · 약 L534–568](05_API_SPEC.md#82-안정-오류-registry), 응답 확실성은 [.claude/spec/05_API_SPEC.md §8.3 · 약 L570–583](05_API_SPEC.md#83-결과-확실성), epoch 적용은 [.claude/spec/06_FRONTEND_SPEC.md §4.2 · 약 L247–257](06_FRONTEND_SPEC.md#42-session-epoch와-generation-fence)을 따릅니다.

## 7. Storage와 앱 lifecycle

기기별 비동기 문자열 read/write/remove/clear fake에 실제 journal 로직을 연결합니다. key 열거·다중 key transaction·atomic replace·crash-safe write를 추가 보장하지 않습니다.

| checkpoint | 확인된 상태 | 중단 뒤 기대 복구 |
|---|---|---|
| pending manifest 쓰기 전 | 이전 ready만 유효 | 이전 확인본 유지, 새 보관 성공 주장 금지 |
| pending manifest read-back 뒤 | 새 record ref가 pending | record 유효성에 따라 승격 또는 pending만 정리 |
| record read-back 뒤 | 독립 record exact 확인 | ready pointer 미교체면 bootstrap에서 안전하게 승격 가능 |
| ready manifest read-back 뒤 | 새 version이 전역 확인본 | 이전 record는 두 사본의 참조 확인 뒤에만 제거 |
| proof 보관 뒤 | terminal 최소 proof 확인 | view/cache 반영과 정리를 재개 |
| view/재조회 예약 뒤 | 현재 방문 반영은 반복 가능 | 메모리 재시작 시 현재 정본을 다시 동기화 |
| 민감 record 제거 뒤 | 본문/payload 정리 확인 | ack 실패가 민감 record를 복원하지 않음 |
| ack 시도·응답 전후 | 서버 presentation 제거 가능 | proof/result 수명과 로컬 정리를 합치지 않음 |
| deletion local clear 뒤 | old generation 제거 확인 | 최소 receipt 실패에도 새 generation을 지우지 않음 |

- 느린 write, reject/무효 write, read-back 불일치, A/B 한쪽·양쪽 손상, 같은 sequence 충돌, pending 부재, remove/clear 실패, 동시 metadata와 늦은 old write를 관련 시나리오에만 주입합니다.
- 첫 mutation 전에는 최신 draft·tracker·필요한 payload를 확인해야 합니다. ticket read-back 실패면 execute하지 않고 같은 operation/input으로 prepare 결과를 복원합니다. 이미 수락된 요청은 로컬 실패와 무관하게 결과 추적을 유지합니다.
- background는 FE timer/poll을 멈춥니다. foreground는 현재 tracker를 같은 single-flight로 우선 확인합니다. restart는 확인된 Storage를 유지하고 메모리 token/cache/navigation/분석 queue를 잃습니다.
- 원문 보존·잠금·복사·재보관은 실패 중에도 유지합니다. 실제 SDK persistence는 [.claude/spec/08_QA_AND_INTEGRATION.md §6 · 약 L113–124](08_QA_AND_INTEGRATION.md#6-storage-lifecycle과-복구-검증)에서 별도 확인합니다.
- journal 구현 순서: [.claude/spec/06_FRONTEND_SPEC.md §8.2 · 약 L472–483](06_FRONTEND_SPEC.md#82-교대-사본과-다중-key-쓰기-순서) 및 [.claude/spec/06_FRONTEND_SPEC.md §8.3 · 약 L485–494](06_FRONTEND_SPEC.md#83-mutation-선보관).

## 8. Command·다중 기기·동시성

- 서버 판정, 로컬 proof/view/cleanup/ack 진척, 방문 피드백을 별도 축으로 관찰합니다. 알림 표식으로 정리를 생략하지 않습니다.
- 최초 저장 성공을 F11에서 확인했을 때만 F12·연출·햅틱 자격이 있습니다. 이탈 뒤 성공은 현재 화면 알림 1회와 정본 동기화로 처리합니다.
- 두 기기 경쟁은 prepare/execute 수락·commit·ack·삭제 fence·응답 전달 중 필요한 선후 순서만 고정합니다. 무작위 병렬 timing에 기대지 않습니다.
- proof와 현재 presentation/excerpt/count는 독립입니다. receipt 뒤 수정/삭제에는 과거 revision과 현재 내용을 섞지 않습니다.
- 상태/복구 순서: [.claude/spec/06_FRONTEND_SPEC.md §8.4 · 약 L496–506](06_FRONTEND_SPEC.md#84-command의-독립-상태-축)부터 [.claude/spec/06_FRONTEND_SPEC.md §8.7 · 약 L542–551](06_FRONTEND_SPEC.md#87-늦은-결과와-중복-방지); 서버 멱등·수명: [.claude/spec/05_API_SPEC.md §9 · 약 L585–623](05_API_SPEC.md#9-멱등성동시성결과-보존).

## 9. Query·목록·NavigationContext

- 변화 없는 query는 고정 page, mutation case는 전후 fixture/응답 순서로 제공합니다. today·count의 snapshot 관계를 지키되 count 실패는 독립입니다.
- 목록은 0/1/2/20/21개·월/연도 경계를 둡니다. 첫 page 상한 뒤 신규 삽입 금지, 수정 최신 revision, 삭제 생략, 중복/누락 방지를 확인합니다. cursor 값 자체를 해석하지 않습니다.
- 깊은 scroll에서는 준비된 first-page 후보를 안내 없이 보류하고 기존 rows/anchor/focus를 유지합니다. 상단 도달 적용 전 tail과 섞지 않으며 mutation·cursor 무효화·refresh 실패에는 후보를 폐기합니다.
- NavigationContext는 같은 방문의 선택·위치만 보관합니다. 원문/token/ticket을 복사하지 않고 identity/revision/owner/epoch가 달라지거나 reload·삭제되면 폐기합니다.
- 상세: [.claude/spec/06_FRONTEND_SPEC.md §6.3 · 약 L378–395](06_FRONTEND_SPEC.md#63-f20-page-chain과-누적-수), [.claude/spec/06_FRONTEND_SPEC.md §5.6 · 약 L343–351](06_FRONTEND_SPEC.md#56-navigationcontext의-수명과-복원).

## 10. 플랫폼·분석·민감정보

- 익명 키 실패/빈 값/미지원은 session 요청·임의 key fallback 없이 F90입니다.
- Clipboard는 SDK→표준 API→직접 선택 순서입니다. network/time은 hint이며 자동 저장·서버 날짜 판정을 만들지 않습니다.
- Safe Area·haptic·자원 실패·Reduced Motion은 입력·저장·이동을 막지 않습니다.
- 분석은 메모리 queue, batch 20·상한 100, bounded retry·비차단, reload 유실 허용, generation 변경 시 queued/in-flight 폐기를 재현합니다. FE가 BE 소유 성공 event를 만들지 않습니다.

### 10.3 민감정보 canary

canary·금지 sink·UI 캡처·증거 보호는 [.claude/spec/08_QA_AND_INTEGRATION.md §9 · 약 L148–177](08_QA_AND_INTEGRATION.md#9-개인정보-분석-보안과-artifact)를 따릅니다. 플랫폼별 사건은 해당 카탈로그 행에서 선택합니다.

## 11. 이름 있는 시나리오 카탈로그

### 11.1 우선순위

P0-core는 질문→작성→저장→다시 읽기와 입력/응답 유실, P0-recovery는 command·Storage·경쟁 복구입니다. P1은 해당 탑승·닉네임·기록·분석 기능 구현 시, P2-assistive는 해당 capability/장식을 처음 쓸 때 검증합니다. P1/P2도 관련 MVP 기능의 출시에는 필요합니다.

64개 ID는 추적 단위이며 테스트 이름에 해당 ID를 포함합니다(`MS-LIST-001/002`처럼 묶음 표기 가능). 같은 결과는 공통 테스트로 충족할 수 있습니다. `MS-CORE-009`와 `MS-PLATFORM-003`은 공통 실행으로 연결합니다. API·수락 기준 상세는 행의 링크, 구현·UI 상세는 묶음별 포인터에서 확인합니다.

### 11.2 P0 핵심 질문→작성→저장→다시 읽기

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §7 · 약 L413–451](06_FRONTEND_SPEC.md#7-입력과-임시-보관); [.claude/spec/04_INTERACTIONS_AND_COPY.md §5.14 · 약 L284–295](04_INTERACTIONS_AND_COPY.md#514-저장-결과-확인과-안전한-이탈--ix-036); [.claude/spec/04_INTERACTIONS_AND_COPY.md §5.17 · 약 L329–334](04_INTERACTIONS_AND_COPY.md#517-완료-결과와-행동-고정--ix-039).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-CORE-001` | ACTIVE·오늘 미응답·기억 0개. 기본 질문 선택, 합성 짧은 답 입력, draft read-back, 정상 prepare/execute SUCCEEDED | F10→F11→F12. 입력 원문과 저장 snapshot이 같고 F21 전문이 같은 문장을 표시. F12·F10 완료 상태는 원문을 표시하지 않음. count 1이면 F12 첫 조작 시 기록 우선, 햅틱 1회, 임시본 제거 | OP-005~011; [API-V-005 · API-V-006 · API-V-010 · API-V-012, L841, L843 · 약 L797–804](05_API_SPEC.md#15-계약-검증-추적); [Acc #9 · #10 · #11 · #12 · #13 · #14 · #15 · #16 · #21 · #23 · #33 · #34 · #35 · #36 · #52, L75–77, L87, L89, L109, L111–113, L142 · 약 L63–71](../../docs/ARCA_MVP_ACCEPTANCE.md#질문-선택) |
| `MS-CORE-002` | corpus의 공백 전용·연속 공백·빈 줄·결합 이모지·정확 2,000 EGC를 각각 저장 | trim·정규화·공백 축약·자동 절단 없이 F21까지 왕복. EGC/논리적 줄 경계와 발췌 prefix 일치 | OP-006~008·011; [API-V-006 · API-V-016, L847 · 약 L798–808](05_API_SPEC.md#15-계약-검증-추적); [Acc #16 · #23 · #33, L89, L109 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CORE-003` | 계속 입력, 499/500ms, 최초 변경 후 2초, 긴 IME composition, 느린 write와 새 editVersion | IME 중 카운터는 현재 값으로 즉시 갱신하되 검증·보관 commit 확정 없음. trailing/maxWait 뒤 최신 완료 입력만 보관 요청, 오래된 write 성공으로 최신 persisted 표시 금지 | local; [API-V-017 · 약 L809](05_API_SPEC.md#15-계약-검증-추적); [Acc #14 · #36 · #40 · #49, L113, L122, L139 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CORE-004` | 최신 draft 성공, command meta 또는 payload read-back 실패 | 첫 mutation 또는 OP-007을 보내지 않음. 입력·선택·복사·재보관 유지, 안전 이탈을 허위 제공하지 않음 | OP-006~007 미전송; [API-V-009 · 약 L801](05_API_SPEC.md#15-계약-검증-추적); [Acc #17 · #39 · #40 · #51, L121–122, L141 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CORE-005` | OP-006이 PREPARED를 수락한 뒤 response 유실. 같은 operation/input으로 재전송 | 같은 ticket/current result 복원, payload가 확인됐을 때만 같은 ticket 실행. 새 operation·중복 답변 없음 | OP-006~008; [API-V-008 · API-V-009 · API-V-020, L851 · 약 L800–812](05_API_SPEC.md#15-계약-검증-추적); [Acc #16 · #39 · #43, L121, L128 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CORE-006` | OP-007 payload 수락 또는 terminal commit 뒤 response 유실 | 실패로 표시·새 저장하지 않고 OP-008로 EXECUTING/terminal 확인. 효과 1회, 동일 원문·proof 유지 | OP-007~009; [API-V-008 · API-V-009 · API-V-010 · API-V-020, L851 · 약 L800–812](05_API_SPEC.md#15-계약-검증-추적); [Acc #16 · #35 · #39 · #43, L112, L121, L128 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CORE-007` | 본문·tracker 보관 확인 후 결과 조회 중 F11 이탈, background에서 terminal 성공, F10 재진입 | 이탈은 취소가 아님. 강제 F12·연출·햅틱 없이 성공 알림 1회와 today/cache 동기화, 관련 draft 정리·ack 재개 | OP-008~009; [API-V-009 · API-V-010 · API-V-026, L857 · 약 L801–818](05_API_SPEC.md#15-계약-검증-추적); [Acc #35 · #39 · #51, L121, L141 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |
| `MS-CORE-008` | SUCCEEDED proof, excerpt unavailable, count unavailable 후 서로 다른 시점에 보강 | 완료 heading·두 이동 유지, 저장 재실행 없음. 첫 조작 가능 시 오늘 우선으로 고정하고 늦은 count로 버튼 위계·focus 변경 금지 | OP-005·008; [API-V-010 · API-V-025, L856 · 약 L802–817](05_API_SPEC.md#15-계약-검증-추적); [Acc #35 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |
| `MS-CORE-009` | 완료 장면 자원 지연/실패, font 지연, Reduced Motion on/off | 질문·입력·저장 결과·이동이 자원을 기다리지 않음. layout shift나 늦은 연출 재시작 없음 | platform/local; [Acc #36 · #52 · #53, L142, L148 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |
| `MS-CORE-010` | 기존 활성 기억 1개인 다른 날짜 world에서 오늘 신규 저장해 terminal count 2 확인 | F12 이동이 처음 가능할 때 오늘 복귀 우선, 기록 이동도 유지. 이후 count 변화·재조회가 같은 방문의 위치·이름·강조·focus를 바꾸지 않음 | OP-005·008; [API-V-010 · API-V-025, L856 · 약 L802–817](05_API_SPEC.md#15-계약-검증-추적); [Acc #35 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |

### 11.3 session·탑승·닉네임

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §5.3 · 약 L308–327](06_FRONTEND_SPEC.md#53-bootstrap-순서); [.claude/spec/06_FRONTEND_SPEC.md §9.1 · 약 L555–565](06_FRONTEND_SPEC.md#91-승객-생성과-닉네임); [.claude/spec/04_INTERACTIONS_AND_COPY.md §5.13 · 약 L276–282](04_INTERACTIONS_AND_COPY.md#513-선택형-닉네임-실패-진행--ix-035).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-SES-001` | 유효 미등록 합성 key와 같은 등록 key로 각각 시작 | 미등록은 passenger 생성 없이 PRE→F01, 등록 key는 ACTIVE→F10과 기존 기록 복원 | OP-001~002; [API-V-001 · 약 L793](05_API_SPEC.md#15-계약-검증-추적); [Acc #2 · #6, L57 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |
| `MS-SES-002` | anonymous key SDK 오류·미지원·빈 값 | OP-001 미전송, random/local fallback 없이 F90. retry도 최신 key 판정을 반복 | OP-001; [API-V-002 · 약 L794](05_API_SPEC.md#15-계약-검증-추적); [Acc #29 · 약 L95–105](../../docs/ARCA_MVP_ACCEPTANCE.md#실제-환경과-보호) |
| `MS-SES-003` | ACTIVE query가 `SESSION_RECOVERY_REQUIRED`를 받고 같은 주체·generation으로 재교환 | 같은 사용자 행동 최대 1회 재요청. 확인된 cache·navigation 유지, old epoch late response는 적용하지 않음 | OP-001·해당 OP; [API-V-002 · 약 L794](05_API_SPEC.md#15-계약-검증-추적); [Acc #29 · #50, L140 · 약 L95–105](../../docs/ARCA_MVP_ACCEPTANCE.md#실제-환경과-보호) |
| `MS-SES-004` | 재교환 결과 주체·권한 또는 generation 변경 | 이전 private cache·draft·tracker·navigation 폐기, 이전 command 자동 재실행·늦은 응답 적용 금지 | OP-001; [API-V-014 · API-V-017 · API-V-021, L848, L852 · 약 L806–813](05_API_SPEC.md#15-계약-검증-추적); [Acc #39 · #44 · #50, L129, L140 · 약 L119–123](../../docs/ARCA_MVP_ACCEPTANCE.md#문구복합-실패결과-미확인-복구) |
| `MS-ONB-001` | 필수 정책 중 하나 누락, 제출 직전 version 변경, 이후 최신 두 정책 동의 | 거절 시 passenger 없음·checkbox/scroll 유지. 최신 정확 version 성공에서만 passenger와 동의 원자 생성 | OP-003; [API-V-003 · 약 L795](05_API_SPEC.md#15-계약-검증-추적); [Acc #2 · #3 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |
| `MS-ONB-002` | OP-003 commit 뒤 response 유실, PRE token 폐기, OP-001 재교환 후 같은 ID/input 재전송 | 같은 생성 효과와 ACTIVE continuation 복원. 새 passenger·중복 완료 연출 없음, F03으로 replace | OP-001·003; [API-V-003 · API-V-022, L853 · 약 L795–814](05_API_SPEC.md#15-계약-검증-추적); [Acc #3 · #6 · #45, L57, L130 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |
| `MS-ONB-003` | PRE 상태 F01에서 6장면 진행·각 장면의 건너뛰기, 분석 flush 실패 | 장면 진행은 진행 정보·새 장면 본문을 한 번 알리고 어디서 건너뛰어도 추가 확인 없이 F02. 원문 펼침 조작 없음. passenger 생성 없음, 분석 실패가 이동을 막지 않음 | OP-014만 측정; [API-V-018 · 약 L810](05_API_SPEC.md#15-계약-검증-추적); [Acc #1 · #2 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |
| `MS-NICK-001` | F03 빈 값, 1/2/12/13 EGC, 결합 이모지, 금지 문자, 확정 실패 뒤 명시적 건너뛰기 | 빈 값은 무요청 F10. 유효값만 OP-004. 오류·실패는 입력 유지, 사용자가 선택한 건너뛰기만 편집값 폐기 | OP-004; [API-V-004 · 약 L796](05_API_SPEC.md#15-계약-검증-추적); [Acc #4 · #7, L58 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |
| `MS-NICK-002` | OP-004 response 유실, 같은 key 재전송 사이 기기 B가 최신 nickname 수정, 결과 7일 만료 | 같은 key receipt를 복원하되 오래된 receipt로 최신 profile을 덮지 않음. 만료 key는 재실행하지 않고 현재 profile 뒤 새 사용자 행동 사용 | OP-002·004; [API-V-004 · API-V-023, L854 · 약 L796–815](05_API_SPEC.md#15-계약-검증-추적); [Acc #4 · #7 · #45, L58, L130 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |

### 11.4 날짜·SEMA·draft·result 수명

상세 구현이 필요할 때만: [.claude/spec/05_API_SPEC.md §2.3 · 약 L81–88](05_API_SPEC.md#23-서버와-클라이언트-시간); [.claude/spec/06_FRONTEND_SPEC.md §7.4 · 약 L444–451](06_FRONTEND_SPEC.md#74-보관-상태와-만료); [.claude/spec/05_API_SPEC.md §9.3 · 약 L610–616](05_API_SPEC.md#93-result-수명과-acknowledgement).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-TIME-001` | 23:59 KST OP-006 수락, 00:01이지만 executeBy 안에 같은 payload 실행 | acceptedDateKst의 answer 1개 성공, 저장 당시 질문 snapshot 보존 | OP-005~008; [API-V-007 · 약 L799](05_API_SPEC.md#15-계약-검증-추적); [Acc #18 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-TIME-002` | 23:59 draft만 작성, 00:01에 전날 SEMA로 처음 OP-006 | DATE_CHANGED/SEMA_REPLACED로 ticket 없음. 본문 유지, F13 복사 우선, 오늘 질문 자동 전용 없음 | OP-005~006; [API-V-007 · 약 L799](05_API_SPEC.md#15-계약-검증-추적); [Acc #18 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-SEMA-001` | 오늘 정상 콘텐츠를 예비 콘텐츠로 교체, 같은 dailySemaId·새 sema/question identity | 기존 저장은 완료·snapshot 유지. 미저장 이전 질문 draft는 새 질문에 적용하지 않음. 교체 전 수락 ticket은 계약대로 실행 가능 | OP-005~008·011; [API-V-005 · API-V-024, L855 · 약 L797–816](05_API_SPEC.md#15-계약-검증-추적); [Acc #9 · #10 · #11 · #12 · #13 · #23 · #42, L89, L127 · 약 L63–71](../../docs/ARCA_MVP_ACCEPTANCE.md#질문-선택) |
| `MS-DRAFT-001` | 기본·대체 질문에 다른 합성 본문, 왕복·restart | 전환 전 exact read-back 성공 뒤 질문별 본문 복원. 실패면 전환하지 않고 현재 입력·cursor 유지 | local/OP-005; [API-V-005 · API-V-006 · 약 L797–798](05_API_SPEC.md#15-계약-검증-추적); [Acc #10 · #11 · #12 · #13 · #14, L75 · 약 L63–71](../../docs/ARCA_MVP_ACCEPTANCE.md#질문-선택) |
| `MS-DRAFT-002` | lastModified 직전/정확 7일/직후, device clock 뒤로 이동과 재실행 | 직전 유지, 경계부터 만료·원문 미복원. clock rollback으로 조기 삭제하지 않으며 열람/repair가 기한을 연장하지 않음 | local; [API-V-009 · API-V-026, L857 · 약 L801–818](05_API_SPEC.md#15-계약-검증-추적); [Acc #15 · #18 · #39, L79, L121 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-RESULT-001` | terminal 직전/정확 7일/직후, ack 여부 변형 | 보존 중 proof/error 유지. 만료 후 CLOSED_OUTCOME_UNAVAILABLE과 추가 실행 불가만 확인, 자동 재저장·과거 outcome 추정 없음 | OP-008·015; [API-V-026 · 약 L818](05_API_SPEC.md#15-계약-검증-추적); [Acc #39 · #43, L128 · 약 L119–123](../../docs/ARCA_MVP_ACCEPTANCE.md#문구복합-실패결과-미확인-복구) |
| `MS-TIME-003` | foreground 조회 cycle 중 background, server terminal 뒤 foreground | background에서 FE timer 멈춤. foreground에서 같은 tracker를 먼저 확인해 terminal 적용, timeout이나 경과만으로 실패 처리 없음 | OP-008~009; [API-V-009 · API-V-020, L851 · 약 L801–812](05_API_SPEC.md#15-계약-검증-추적); [Acc #39 · #50, L140 · 약 L119–123](../../docs/ARCA_MVP_ACCEPTANCE.md#문구복합-실패결과-미확인-복구) |

### 11.5 command·수정·두 기기

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §8.5 · 약 L508–528](06_FRONTEND_SPEC.md#85-command-사건-순서); [.claude/spec/06_FRONTEND_SPEC.md §8.7 · 약 L542–551](06_FRONTEND_SPEC.md#87-늦은-결과와-중복-방지); [.claude/spec/05_API_SPEC.md §9.1 · 약 L587–600](05_API_SPEC.md#91-오퍼레이션별-규칙).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-CMD-001` | 같은 operation/ticket/payload를 중복 prepare·execute | 같은 ticket·proof, 효과 최대 1회. 활성 답변과 BE 성공 event도 하나 | OP-006~009; [API-V-008 · 약 L800](05_API_SPEC.md#15-계약-검증-추적); [Acc #16 · #39, L121 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CMD-002` | 같은 operation ID를 다른 prepare input 또는 같은 ticket을 다른 content로 재사용 | IDEMPOTENCY_KEY_REUSED 또는 COMMAND_PAYLOAD_MISMATCH, 새 효과 없음. 최초 고정 payload/result 유지 | OP-006~008; [API-V-008 · 약 L800](05_API_SPEC.md#15-계약-검증-추적); [Acc #16 · #39, L121 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-CMD-003` | 장기 EXECUTING, 즉시·1·3·7초 조회도 nonterminal, 10초 경과, 수동 재확인 뒤 성공 | 정적 미확인과 복사·재확인·조건부 안전 이탈. OP-007 반복·무한 polling 없음, 늦은 terminal 정상 적용 | OP-007~009; [API-V-009 · API-V-020, L851 · 약 L801–812](05_API_SPEC.md#15-계약-검증-추적); [Acc #39 · 약 L119–123](../../docs/ARCA_MVP_ACCEPTANCE.md#문구복합-실패결과-미확인-복구) |
| `MS-CMD-004` | PREPARED에서 execute 수락과 사용자의 OP-015 종료를 barrier 양쪽 순서로 실행 | 한쪽만 원자적으로 승리. 종료 승리면 NOT_APPLIED/COMMAND_CLOSED, execute 승리면 EXECUTING/terminal 확인 유지 | OP-007·008·015; [API-V-020 · API-V-026, L857 · 약 L812–818](05_API_SPEC.md#15-계약-검증-추적); [Acc #43 · 약 L125–134](../../docs/ARCA_MVP_ACCEPTANCE.md#api-재설계의-사용자-결과) |
| `MS-CMD-005` | 기기 A가 terminal 결과 ack, 기기 B가 같은 ticket 결과 조회 | B는 ACKNOWLEDGED presentation이어도 최소 proof/error를 복원하고 현재 resource를 별도 조회 | OP-008~009; [API-V-021 · 약 L813](05_API_SPEC.md#15-계약-검증-추적); [Acc #44 · 약 L125–134](../../docs/ARCA_MVP_ACCEPTANCE.md#api-재설계의-사용자-결과) |
| `MS-CMD-006` | prepare 또는 execute request가 server에 도착하지 않음, 이후 같은 operation/input 또는 ticket/payload로 사용자가 재시도 | 미도착 단계에는 server 효과 없음. prepare 재전송은 같은 의미 ticket을 만들거나 복원하고 execute 재전송은 같은 ticket 단일 효과. 미도착 자체를 NOT_APPLIED로 표시하지 않음 | OP-006~008; [API-V-008 · API-V-009 · API-V-020, L851 · 약 L800–812](05_API_SPEC.md#15-계약-검증-추적); [Acc #16 · #39 · #43, L121, L128 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-EDIT-001` | F22 expected revision 일치 수정 성공 | 전문·revision·updatedAt·isEdited와 세 profile 발췌 갱신, 질문 snapshot/createdAt 유지. F21은 새 전문을 표시하고 수정 표시·화면 성공 문구 없이 접근성 발표 1회. F20 행 갱신, F12 연출 없음 | OP-006~011; [API-V-011 · API-V-016, L847 · 약 L803–808](05_API_SPEC.md#15-계약-검증-추적); [Acc #19 · #23 · #33, L89, L109 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-EDIT-002` | 기기 A·B가 같은 base revision 수정, A commit 후 B 실행 | B는 REVISION_CONFLICT terminal 미적용, 입력 유지·최신 detail 조회. A 본문 일부로 섞이지 않음 | OP-006~008·011; [API-V-011 · API-V-013 · API-V-025, L844, L856 · 약 L803–817](05_API_SPEC.md#15-계약-검증-추적); [Acc #19 · #39 · #46, L121, L131 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-RECEIPT-001` | write receipt 뒤 다른 기기가 수정/삭제, 과거 receipt presentation 재조회 | proof는 유지하되 RESOURCE_CHANGED. 옛 revision에 새 발췌 결합 금지, OP-005/010/011 현재 상태 사용 | OP-005·008·010·011; [API-V-025 · 약 L817](05_API_SPEC.md#15-계약-검증-추적); [Acc #33 · #35 · #46, L112, L131 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |

### 11.6 개별 삭제·전체 삭제

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §9.2 · 약 L567–574](06_FRONTEND_SPEC.md#92-개별-삭제); [.claude/spec/06_FRONTEND_SPEC.md §9.4 · 약 L580–602](06_FRONTEND_SPEC.md#94-모든-데이터-삭제-성공-순서); [.claude/spec/05_API_SPEC.md §10.3 · 약 L644–661](05_API_SPEC.md#103-모든-데이터-삭제).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-DELETE-001` | 두 기기가 같은 answer revision으로 삭제 prepare, A 삭제 commit 뒤 B 실행 | A DELETED, B ALREADY_ABSENT로 성공 합류. effect 1회, 두 기기 detail/list/today가 현재 상태로 동기화 | OP-007~012; [API-V-013 · 약 L805](05_API_SPEC.md#15-계약-검증-추적); [Acc #20 · #22, L88 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-DELETE-002` | delete prepare 뒤 다른 기기가 answer 수정, 이후 delete execute | NOT_APPLIED/REVISION_CONFLICT, 수정된 답변 유지. 기존 F21·입력 문맥에서 최신 detail 확인 | OP-007~012; [API-V-011 · API-V-013, L844 · 약 L803–805](05_API_SPEC.md#15-계약-검증-추적); [Acc #19 · #22, L88 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-ALLDEL-001` | 전체 삭제 commit 전 주입 실패·rollback | NOT_APPLIED/ALL_DATA_DELETE_FAILED, 서버 활성 데이터·기기 cache/draft/session을 먼저 지우지 않음, F31 유지 | OP-013·007~008; [API-V-014 · API-V-015 · API-V-027, L858 · 약 L806–819](05_API_SPEC.md#15-계약-검증-추적); [Acc #24 · #25 · #47, L132 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-ALLDEL-002` | 삭제 commit 뒤 response 유실·앱 종료, 같은 key로 DELETION_RECOVERY | OP-008로 SUCCEEDED 복원, 이전 generation local 정리 후 F01. 재삭제·과거 ACTIVE query 금지 | OP-001·007~009·013; [API-V-014 · API-V-015 · API-V-021 · API-V-027, L852, L858 · 약 L806–819](05_API_SPEC.md#15-계약-검증-추적); [Acc #24 · #39 · #44 · #47, L121, L129, L132 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-ALLDEL-003` | SUCCEEDED 뒤 old Storage remove 실패, 재시도 성공, 최소 receipt write 실패 또는 ack response 유실 | remove 실패 중 재탑승 금지. old 영역 제거 확인 뒤 receipt/ack 실패는 서버 성공을 취소하지 않고 F01, 다음 OP-001 recentDeletion으로 조정 | OP-001·008~009; [API-V-021 · API-V-027, L858 · 약 L813–819](05_API_SPEC.md#15-계약-검증-추적); [Acc #24 · #44 · #51, L129, L141 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-ALLDEL-004` | 삭제 성공 뒤 새 탑승 generation 생성, 이후 다른 기기의 오래된 receipt/recentDeletion 도착 | old generation만 정리하고 새 passenger·draft·cache·history를 지우지 않음 | OP-001·008~009; [API-V-014 · API-V-021, L852 · 약 L806–813](05_API_SPEC.md#15-계약-검증-추적); [Acc #44 · #50, L140 · 약 L125–134](../../docs/ARCA_MVP_ACCEPTANCE.md#api-재설계의-사용자-결과) |
| `MS-ALLDEL-005` | deletion prepare/commit과 nickname, PREPARED answer, EXECUTING worker를 barrier별 경쟁 | fence 뒤 새 nickname/prepare/기존 PREPARED 실행 차단. 기존 EXECUTING은 계약에 맞게 먼저 해결하거나 prepare 거절. 성공 뒤 worker 부활 없음 | OP-004·006~008·013; [API-V-014 · API-V-027, L858 · 약 L806–819](05_API_SPEC.md#15-계약-검증-추적); [Acc #47 · 약 L125–134](../../docs/ARCA_MVP_ACCEPTANCE.md#api-재설계의-사용자-결과) |

### 11.7 목록·cursor·탐색

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §6.3 · 약 L378–395](06_FRONTEND_SPEC.md#63-f20-page-chain과-누적-수); [.claude/spec/06_FRONTEND_SPEC.md §5.6 · 약 L343–351](06_FRONTEND_SPEC.md#56-navigationcontext의-수명과-복원); [.claude/spec/04_INTERACTIONS_AND_COPY.md §5.14.2 · 약 L312–320](04_INTERACTIONS_AND_COPY.md#5142-기록-목록의-상단-갱신--ix-042).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-LIST-001` | 각각 0·1·2개 answer world | Empty/단일/복수 상태와 count 독립 표시. 행에는 질문·날짜만 표시하며 응답은 상세에서 읽음. 저장되지 않은 draft·미확인 command를 row로 만들지 않음 | OP-005·010; [API-V-010 · API-V-012, L843 · 약 L802–804](05_API_SPEC.md#15-계약-검증-추적); [Acc #21 · #33 · #41, L109, L123 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-LIST-002` | 정확히 20개, nextCursor 없음 | row 20개·중복 없음. 다음 page 감시·요청 없음, 종료 문구(`CPY-F20-021`) 미노출 | OP-010; [API-V-012 · 약 L804](05_API_SPEC.md#15-계약-검증-추적); [Acc #21 · #41, L123 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-LIST-003` | 21개, 목록 끝이 가까워져 second page 자동 요청 | 20+1, 원래 최신순·중복/누락 없음, 첫 page 상한 유지. 추가 page 버튼 없음, 불러오는 동안 로더, 포커스 불변, 불러온 수 발표. 추가 page 뒤 끝에서만 종료 문구 | OP-010; [API-V-012 · 약 L804](05_API_SPEC.md#15-계약-검증-추적); [Acc #21 · #38, L115 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-LIST-004` | 월 경계가 page 사이에 이어지고 연도 경계 포함 | 같은 월 heading 중복 없음, 연도 구분·행 날짜·최신순 유지, 미작성 기간 빈칸 없음 | OP-010; [API-V-012 · 약 L804](05_API_SPEC.md#15-계약-검증-추적); [Acc #38 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |
| `MS-LIST-005` | 첫 page 후 다른 기기 생성·수정·삭제, 이후 next page | 신규는 기존 chain에 끼지 않음. 수정 최신 revision, 삭제 생략, 중복 row 없음. cursor invalid면 tail 유지·첫 page refresh 제공 | OP-010~011; [API-V-012 · API-V-013 · API-V-025, L856 · 약 L804–817](05_API_SPEC.md#15-계약-검증-추적); [Acc #33 · #38 · #46 · #48, L115, L131, L138 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |
| `MS-LIST-006` | 깊은 scroll anchor에서 새 first-page 후보 준비·실패·교체·사용자 적용 | 준비 전후 모두 안내·행동 없음. 기존 rows/scroll/focus 유지. `맨 위로`·직접 스크롤로 상단 도달 시 유효 후보만 적용, 기존 tail과 혼합 없음 | OP-010; [API-V-012 · 약 L804](05_API_SPEC.md#15-계약-검증-추적); [Acc #48 · 약 L136–144](../../docs/ARCA_MVP_ACCEPTANCE.md#프런트엔드-리뷰의-사용자-결과) |
| `MS-LIST-007` | OP-010 성공+OP-005 count 실패, 이어서 OP-010 실패+OP-005 count 성공 | 성공한 영역은 유지하고 실패한 영역만 재조회. row 수로 count를 추정하거나 count 성공으로 목록을 완성 상태로 가장하지 않음 | OP-005·010; [API-V-010 · API-V-012, L843 · 약 L802–804](05_API_SPEC.md#15-계약-검증-추적); [Acc #21 · #35 · #38, L112, L115 · 약 L85–93](../../docs/ARCA_MVP_ACCEPTANCE.md#기록과-삭제) |
| `MS-NAV-001` | F10/F11·F20/F21 왕복, 같은 revision과 변경된 revision, reload·삭제·generation 변경 | 유효 identity/version만 selection·anchor 복원. 값 변경·reload·삭제·재탑승에는 낡은 snapshot 폐기, 본문은 DraftRepository만 복원 | local/OP-005·010·011; [API-V-011 · API-V-012 · API-V-013 · 약 L803–805](05_API_SPEC.md#15-계약-검증-추적); [Acc #48 · #50, L140 · 약 L136–144](../../docs/ARCA_MVP_ACCEPTANCE.md#프런트엔드-리뷰의-사용자-결과) |

### 11.8 Storage 복구

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §8.2 · 약 L472–483](06_FRONTEND_SPEC.md#82-교대-사본과-다중-key-쓰기-순서); [.claude/spec/06_FRONTEND_SPEC.md §8.3 · 약 L485–494](06_FRONTEND_SPEC.md#83-mutation-선보관); [.claude/spec/06_FRONTEND_SPEC.md §8.4 · 약 L496–506](06_FRONTEND_SPEC.md#84-command의-독립-상태-축).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-STORAGE-001` | root/manifest 높은 사본 하나 checksum 손상 | 낮은 유효 사본에서 확인 가능한 ready만 복원, 손상된 최신값 보관 성공 주장 금지 | local; [API-V-009 · 약 L801](05_API_SPEC.md#15-계약-검증-추적); [Acc #49 · #51, L141 · 약 L136–144](../../docs/ARCA_MVP_ACCEPTANCE.md#프런트엔드-리뷰의-사용자-결과) |
| `MS-STORAGE-002` | 알려진 root 또는 generation manifest 양쪽 손상/같은 sequence 다른 값 | 안전한 빈 상태로 가장하지 않고 관련 private 화면·mutation 차단, 원문이 메모리에 있으면 유지·복사 제공 | local; [API-V-017 · 약 L809](05_API_SPEC.md#15-계약-검증-추적); [Acc #40 · #51, L141 · 약 L119–123](../../docs/ARCA_MVP_ACCEPTANCE.md#문구복합-실패결과-미확인-복구) |
| `MS-STORAGE-003` | pending manifest/record/ready 각 checkpoint에서 restart | 유효 pending만 승격, 부재·손상 pending만 정리, 이전 ready 보존, orphan 전체 발견 주장 없음 | local; [Acc #14 · #49 · #51, L139, L141 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-STORAGE-004` | 서로 다른 draft/command가 동시에 metadata 갱신, 느린 write 중 새 editVersion | 단일 queue가 모든 ref를 보존하고 최신 완료 입력을 다음 write로 합침. 오래된 완료로 최신 persisted 표시 금지 | local; [Acc #49 · #51, L141 · 약 L136–144](../../docs/ARCA_MVP_ACCEPTANCE.md#프런트엔드-리뷰의-사용자-결과) |
| `MS-STORAGE-005` | terminal proof·view·record cleanup·ack 각 단계 직후 restart | 완료된 단계는 반복 안전, 미완료 단계만 재개. cache 재구성·정리·ack가 알림 표식 때문에 생략되지 않음 | OP-008~009; [API-V-009 · API-V-021 · API-V-026, L852, L857 · 약 L801–818](05_API_SPEC.md#15-계약-검증-추적); [Acc #39 · #44 · #51, L129, L141 · 약 L119–123](../../docs/ARCA_MVP_ACCEPTANCE.md#문구복합-실패결과-미확인-복구) |
| `MS-STORAGE-006` | 삭제 tombstone/barrier 뒤 old pending write·낮은 사본 복귀 | old 본문/payload가 ready로 부활하지 않고 새 generation도 손상하지 않음 | OP-001·013; [API-V-014 · API-V-021 · API-V-027, L852, L858 · 약 L806–819](05_API_SPEC.md#15-계약-검증-추적); [Acc #44 · #47 · #51, L132, L141 · 약 L125–134](../../docs/ARCA_MVP_ACCEPTANCE.md#api-재설계의-사용자-결과) |

### 11.9 플랫폼·분석·protocol

상세 구현이 필요할 때만: [.claude/spec/06_FRONTEND_SPEC.md §10.3 · 약 L618–627](06_FRONTEND_SPEC.md#103-fe-제품-이벤트); [.claude/spec/06_FRONTEND_SPEC.md §10.4 · 약 L629–641](06_FRONTEND_SPEC.md#104-민감-정보와-오류-보고); [.claude/spec/05_API_SPEC.md §8.2 · 약 L534–568](05_API_SPEC.md#82-안정-오류-registry).

| ID | 시작·사건 | 관찰 가능한 기대 결과 | API·수락 기준 |
|---|---|---|---|
| `MS-PLATFORM-001` | Clipboard SDK→표준 API 성공/거절/미지원 조합 | 우선순위대로 한 단계씩 시도. 모두 실패하면 원문 유지·read-only 직접 선택·화면/접근성 안내 | local; [Acc #18 · #40, L122 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-PLATFORM-002` | Safe Area·network·server time·haptic capability 각각 부재 | layout/안내/감각 기능만 축소. 서버 날짜·저장 성공·화면 전이는 바뀌지 않음 | OP-005~008; [Acc #17 · #26 · #29, L97, L100 · 약 L73–83](../../docs/ARCA_MVP_ACCEPTANCE.md#응답과-날짜) |
| `MS-PLATFORM-003` | 장면/서체 자원 지연·실패·늦은 도착, Reduced Motion | 정적 pixel fallback·실제 text·조작 유지, 입력/커서/버튼 이동·연출 재시작 없음 | local; [Acc #36 · #52 · #53, L142, L148 · 약 L107–117](../../docs/ARCA_MVP_ACCEPTANCE.md#항해-기록-탐색과-원문-보호) |
| `MS-ANALYTICS-001` | FE allowlist 정상 batch, 같은 event ID 중복, 알 수 없는 event/property | 정상 event 한 번 수락. 중복은 추가 집계 없음. 잘못된 batch 전체 거절·민감값 반사 없음, UI 흐름 유지 | OP-014; [API-V-018 · 약 L810](05_API_SPEC.md#15-계약-검증-추적); [Acc §1 · #30 · #32, L101, L103 · 약 L13–33](../../docs/ARCA_MVP_ACCEPTANCE.md#1-제품-판단-이벤트) |
| `MS-ANALYTICS-002` | queue 20/100/101, flush 실패·background·network 복귀·reload·generation 변경 | bounded queue/batch, 화면 비차단, reload 유실 허용, old generation queue 폐기. BE 성공 event를 FE가 만들지 않음 | OP-014; [API-V-018 · 약 L810](05_API_SPEC.md#15-계약-검증-추적); [Acc #30 · #32, L103 · 약 L95–105](../../docs/ARCA_MVP_ACCEPTANCE.md#실제-환경과-보호) |
| `MS-PRIVACY-001` | 데이터 역할별 합성 canary로 핵심·오류·삭제 시나리오 실행 | [.claude/spec/07_MOCK_SCENARIOS.md §10.3 · 약 L177–179](07_MOCK_SCENARIOS.md#103-민감정보-canary) 금지 sink에 canary·token·민감 ID 없음. 오류/분석에는 allowlist 값만 존재 | 공통·OP-014; [API-V-017 · API-V-018 · 약 L809–810](05_API_SPEC.md#15-계약-검증-추적); [Acc #30 · #32 · #33, L103, L109 · 약 L95–105](../../docs/ARCA_MVP_ACCEPTANCE.md#실제-환경과-보호) |
| `MS-PROTOCOL-001` | 호환 추가 field, 필수 field 누락, unknown 필수 enum, invalid date/nullability, 빈 body, code/recovery 불일치 | 호환 추가값은 무시, 나머지는 ProtocolFailure. raw body/message 노출·mutation 성공 추정 없음 | 공통; [API-V-019 · 약 L811](05_API_SPEC.md#15-계약-검증-추적); [Acc #29 · #39, L121 · 약 L95–105](../../docs/ARCA_MVP_ACCEPTANCE.md#실제-환경과-보호) |
| `MS-PROTOCOL-002` | [.claude/spec/05_API_SPEC.md §8.2 · 약 L534–568](05_API_SPEC.md#82-안정-오류-registry)의 400/401/403/404/409/422/429/500/503를 적용 가능한 OP·phase에서 생성 | 안정 code/category/recovery만 기존 UI 상태로 정규화. 인증된 거절과 결과 미확인을 구분하고 입력·목록 보존 | 해당 OP; [API-V-002 · API-V-003 · API-V-004 · API-V-007 · API-V-008 · API-V-009 · API-V-013 · API-V-014 · API-V-015 · API-V-019 · API-V-020 · API-V-021 · API-V-022 · API-V-023, L838–840, L844–846, L850–854 · 약 L794–815](05_API_SPEC.md#15-계약-검증-추적); [Acc #3 · #4 · #17 · #18 · #22 · #29 · #39 · #40 · #41 · #42 · #43, L78–79, L88, L100, L121–123, L127–128 · 약 L50–61](../../docs/ARCA_MVP_ACCEPTANCE.md#최초-탑승) |

`MS-PROTOCOL-002`는 오류 registry의 유효 OP·phase만 조합합니다. 모든 오류×OP 조합을 만들지 않습니다.

## 12. 조합·생성 검증과 커버리지

### 12.1 base + delta + pairwise

다음 여섯 조합은 기존 named case에 사건/assertion을 더해 고정 회귀로 확인합니다.

- response 유실 + Storage tracker 실패
- 안전 이탈 + late terminal + 다른 기기 수정/삭제
- deletion commit + local clear/receipt/ack 실패 + 재탑승
- result 만료 + OP-015 reconciliation + 현재 resource race
- metadata 손상 + generation 변경 + old write/response
- 깊은 scroll + 새 first-page 후보 + mutation/cursor 무효화

### 12.2 seeded state-transition 생성

pairwise·seeded transition·자동 축소는 선택 사항이며 미도입/미실행은 완료 차단 사유가 아닙니다. 도입 시 실패 seed·재현 사건 순서를 남기고 실제 계약 위반은 일반 결함으로 처리합니다. 단일 수락 비교를 수행할 때만 [.claude/spec/05_API_SPEC.md §16 · 약 L831–843](05_API_SPEC.md#16-저장-요청-분할-비교와-상태-전이-검증)을 읽습니다.

### 12.3 API-V-001~027 추적

API-V로 작업을 시작하면 해당 ID를 이 파일의 카탈로그에서 검색합니다. 별도 역방향 표는 유지하지 않습니다. 원본 정의: [.claude/spec/05_API_SPEC.md §15 · 약 L787–829](05_API_SPEC.md#15-계약-검증-추적).

## 13. Assertion 경계와 관찰 결과

정의는 ID/version, Given(합성 fixture), When(사건/fault), Then(필요한 UI/local/server 결과), Never(금지 결과), 원본 연결만 갖춥니다. 관련 불변식이 일관되고 reset 후 재현돼야 합니다. 내부 함수명·render 수·timer 객체 수·Storage 호출 순서를 합격 조건으로 고정하지 않습니다.

Mock 내부 state/fault cursor는 진단용입니다. 실서버 보장은 공개 결과·후속 query·허용 감사 자료로 확인합니다. 실행 범위: [.claude/spec/08_QA_AND_INTEGRATION.md §3 · 약 L50–76](08_QA_AND_INTEGRATION.md#3-07-시나리오-실행-전략).

## 14. `08_QA_AND_INTEGRATION.md` 인계

구현 slice는 [.claude/spec/06_FRONTEND_SPEC.md §12 · 약 L683–700](06_FRONTEND_SPEC.md#12-구현-순서)를 따릅니다. 일상 실행에는 테스트명/ID·결과·commit·실패 재현 정보만 남기고 출시에서 환경/증거를 모읍니다: [.claude/spec/08_QA_AND_INTEGRATION.md §12 · 약 L228–240](08_QA_AND_INTEGRATION.md#12-결과와-증거-기록). 설계 승인만으로 실행·실기기·실서버 통과를 표시하지 않습니다.
