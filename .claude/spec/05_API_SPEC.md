# ARCA API 명세

- 문서 버전: v1.6
- 최근 수정일: 2026년 9월 28일
- 상태: 확정
- 승인 주체: 제품 책임자
- 편집: 중복 인계·설명을 줄이고 작업별 참조 위치를 추가했습니다. 필수 계약은 유지합니다.

OP 의미·시간·원자성·복구의 원본입니다. HTTP 경로는 채택한 **제안 계약**이며 실제 API host·서버 구현은 없습니다. wire 구조는 [OpenAPI](./arca.openapi.json), 실제 연결 전 확인 사항은 §13.2가 소유합니다.

### 최소 읽기 경로

현재 파일은 `.claude/spec/05_API_SPEC.md`입니다. 필요한 절부터 읽습니다. 경로·줄 힌트 사용법은 [00 §3 · L47–53](./00_INDEX.md#3-참조-방향과-중복-방지)을 따릅니다.

| 작업 | 읽을 위치 |
|---|---|
| 계약 강도·불변식 | [§1.2.1 · L36–44](#121-계약-강도와-원본) → [§2 · L52–102](#2-계약-원칙과-불변식) |
| OP·소비 화면 찾기 | [§3 · L104–124](#3-오퍼레이션-인벤토리) → [§4 · L126–148](#4-15개-화면과-오퍼레이션-연결) → 해당 §6 OP |
| 세션·탑승·닉네임 | [§6.1 · L199–219](#61-op-001-establishsession) → [§6.2 · L221–259](#62-op-002004-passenger와-닉네임) |
| 답변 저장·수정·결과 복구 | [§6.4 · L270–298](#64-op-006-prepareanswerwrite) → [§6.7 · L331–361](#67-op-007009-공통-command-lifecycle) → [§9 · L563–601](#9-멱등성동시성결과-보존) |
| 개별·전체 삭제 | [§6.5 · L300–313](#65-op-012-prepareanswerdelete) → [§6.6 · L315–329](#66-op-013-preparealldatadelete) → [§10 · L603–638](#10-수정삭제와-데이터-보존-경계) |
| HTTP·오류·호환성 | [§7 · L391–502](#7-http-wire-계약) → [§8 · L504–561](#8-오류-계약) |
| 분석·개인정보 | [§11 · L640–693](#11-제품-이벤트-계약) → [§12 · L695–717](#12-개인정보보안로그-계약) |
| 실제 연결·검증·분할 비교 | [§13.2 · L733–747](#132-실제-값구현-확인-필요) → [§15 · L763–805](#15-계약-검증-추적) → [§16 · L807–819](#16-저장-요청-분할-비교와-상태-전이-검증) |

## 1. 범위와 권위

### 1.1 이 문서가 소유하는 내용

화면과 독립된 OP·타입·세션/권한·KST/identity·멱등성·결과 복구·삭제 원자성·오류·HTTP 의미·분석/민감정보 경계를 소유합니다. OP 목록은 §3, 계약은 §6, 검증 ID는 §15가 원본입니다.

### 1.2 이 문서가 소유하지 않는 내용

화면·문구는 [03 §3 · L103–123](./03_SCREENS_SPEC.md#3-화면-범위와-추적-지도)·[04 §6 · L351–371](./04_INTERACTIONS_AND_COPY.md#6-화면별-상호작용-인벤토리), 상태·캐시·보관·타이머는 [06 §4 · L209–250](./06_FRONTEND_SPEC.md#4-상태-소유권과-적용-가능성)·[06 §6 · L331–386](./06_FRONTEND_SPEC.md#6-query-cache와-목록)·[06 §8 · L427–525](./06_FRONTEND_SPEC.md#8-storage-journal과-command-복구), Mock·검증은 07·08이 소유합니다. 운영 콘텐츠·법무 자료·실제 연결값은 §13.2에서 추적합니다. DB·내부 서비스 구현은 백엔드 책임이며 §10.3의 전체 삭제 원자성은 필수 제약입니다.

### 1.2.1 계약 강도와 원본

| 강도 | 현재 범위 | 자율 변경·채택 |
|---|---|---|
| 제품 불변식 | §2·Rules의 원문·개인정보·하루 한 활성 답변·날짜·삭제·지연 실행 차단 | 필수. 변경은 제품 SSOT와 승인된 결정에 함께 반영 |
| 채택 계약 | OP의 의미, 결과 상태·복구·권한, OpenAPI의 현재 wire 구조 | FE·BE·Mock이 함께 소비하는 기준. backend 합의 전에도 무단 불일치는 금지하며, 동등성 증거와 schema 변경을 함께 기록해 대안을 채택 |
| 구현 가설·조정 기본값 | prepare/execute 요청 분할, 내부 계층·도구, 발췌 프로필 예산, polling 수치 | 합성 데이터로 비교 가능. 요청 분할은 §16의 실험이며 현재 기본 계약을 유지; 발췌 값은 04 IX-027의 범위에서 조정 |

[arca.openapi.json](./arca.openapi.json)은 경로·method·wire DTO·필수/nullable·오류/이벤트 allowlist의 단일 원본입니다. 본문의 타입명·지도는 설명과 추적이며 schema를 별도로 재작성하는 규범 예시가 아닙니다. 이 문서는 schema로 표현하기 어려운 시간·원자성·재시도·권한 의미를 소유합니다. 둘의 충돌은 [00 §4 · L55–76](./00_INDEX.md#4-충돌-우선순위와-정정-절차)에 따라 같은 변경에서 정정합니다. 현재 계약은 실제 배포 전 제안이며 배포된 v1 클라이언트가 존재한다고 가정하지 않습니다. 향후 배포 뒤의 비호환 변경은 §7.6을 따릅니다.

### 1.3 근거와 충돌 처리

충돌은 [00 §4 · L55–76](./00_INDEX.md#4-충돌-우선순위와-정정-절차), 제품 결정 상태는 [Open Decisions · L1–25](../../docs/ARCA_OPEN_DECISIONS.md), 개발 선택 이유는 [DECISIONS · L1–11](./DECISIONS.md)를 따릅니다.

특히 전체 삭제의 terminal `NOT_APPLIED`는 [Rules AR-06 · L88](../../docs/ARCA_MVP_RULES.md#5-항해-기록과-삭제)에 따라 활성 서비스 데이터가 삭제되지 않았음을 보장합니다. 통신 단절이나 `PREPARED`·`EXECUTING`은 terminal 실패가 아니므로 같은 보장을 표시하지 않습니다. 전체 삭제 뒤 동의 증빙 1년 보존과 백업 최대 30일 만료는 `AR-07~08`의 명시적 예외이며 삭제 누락으로 보지 않습니다.

## 2. 계약 원칙과 불변식

### 2.1 공통 원칙

1. 화면마다 API를 만들지 않고 여러 화면이 같은 도메인 오퍼레이션을 소비합니다.
2. 단순 조회·로컬 행동과 서버 부작용을 구분합니다. 질문 전환·임시본·복사·햅틱·인트로 탐색은 서버 호출이 아닙니다.
3. 서버가 명령을 최초로 영속 수락한 시점의 KST 날짜가 신규 저장 가능 여부를 결정합니다.
4. 명령 수락 뒤 timeout·5xx·파싱 실패는 성공도 실패도 추정하지 않고 같은 ticket의 결과를 조회합니다.
5. terminal `SUCCEEDED`와 `NOT_APPLIED`만 사용자 데이터의 변경 여부를 확정합니다.
6. 본문·닉네임·익명 키 원문은 URL, 로그, 분석, 오류 정보와 외부 오류 추적에 남기지 않습니다.
7. 성공 DTO의 부가 필드 실패는 저장·수정·삭제의 확정 결과를 되돌리지 않습니다.
8. 서버의 자유 형식 메시지를 UI에 표시하지 않고 안정된 오류 code를 `04`의 IX·CPY 상태로 매핑합니다.
9. 질문별 신규·수정 임시본은 기기에만 두고 server sync operation을 만들지 않습니다. 사용자가 저장을 실행한 현재 본문만 OP-007로 전송합니다.

### 2.2 핵심 불변식

| ID | 불변식 | 서버 책임 |
|---|---|---|
| INV-01 | 익명 키 조회만으로 passenger를 만들지 않음 | 유효하지만 미등록인 키에는 `PRE_PASSENGER` 세션만 발급 |
| INV-02 | 같은 앱의 같은 유효 익명 키는 같은 활성 passenger를 복원 | 플랫폼 검증 결과를 서버 내부 주체와 안정적으로 연결 |
| INV-03 | 승객·KST 날짜별 배포 단위당 활성 답변 최대 1개 | 콘텐츠 교체에도 같은 dailySemaId, 유일성 제약과 경쟁 명령 보호 |
| INV-04 | 저장 질문은 이후 콘텐츠 변경과 무관한 snapshot | 저장 수락 시 서버의 정본 질문 ID·버전·원문을 보존 |
| INV-05 | 과거 미작성 SEMA 신규 저장 금지 | client 날짜가 아닌 수락 시점 KST 날짜로 판정 |
| INV-06 | 수정·삭제는 예상 revision과 일치할 때만 적용 | stale 명령은 `REVISION_CONFLICT`로 terminal 미적용 |
| INV-07 | 전체 삭제 뒤 이전 세션·ticket이 데이터를 되살리지 않음 | generation fence와 세션 폐기 적용 |
| INV-08 | 같은 operation ID는 같은 의미·결과 | 다른 입력 재사용은 `IDEMPOTENCY_KEY_REUSED` |
| INV-09 | 발췌는 저장 원문의 연속 prefix | AI 요약·재작성·trim·공백 축약 금지 |
| INV-10 | 전체 삭제는 활성 서비스 범위에서 원자적 terminal 결과 | 일부만 지운 상태를 `SUCCEEDED`나 `NOT_APPLIED`로 노출하지 않음 |

### 2.3 서버와 클라이언트 시간

- `Instant`는 RFC 3339 UTC 문자열, `KstDate`는 `YYYY-MM-DD` 문자열입니다.
- 저장·SEMA·삭제 가능 여부는 ARCA 서버 시간이 최종 권위입니다.
- 앱인토스 `getServerTime()`이나 기기 시각은 진행 표시·사전 안내에만 사용할 수 있고 서버 판정을 대체하지 않습니다.
- 신규 저장 ticket이 수락된 뒤 자정이 지나도 `executeBy` 안의 실행은 수락 당시 `acceptedDateKst`에 완료할 수 있습니다.
- 자정 뒤 처음 prepare한 과거 SEMA 신규 저장은 `DATE_CHANGED` 또는 `SEMA_REPLACED`로 거절합니다.
- 과거에 이미 저장된 답변의 수정·삭제는 현재 날짜와 무관하며 revision을 기준으로 합니다.

### 2.4 FE·BE 책임 경계

| 영역 | FE 책임 | BE 책임 |
|---|---|---|
| 익명 식별·세션 | 플랫폼 key 획득, token 전달, 지정 복구 최대 1회 | key mTLS 검증, mode·권한·만료·폐기 |
| 정책·탑승 | 정책 표시·정확 version 동의 제출 | 활성 정책 SSOT, 동의+passenger 원자 생성·증빙 |
| 입력 검증 | IME를 보존하는 단계 검증과 원문 유지 | 같은 EGC·금지 문자·상한의 최종 검증 |
| 날짜·SEMA | 서버 판정 표시, 두 질문 로컬 선택 | KST 날짜·정본 SEMA·예비 교체·질문 snapshot |
| command | operation ID·ticket·본문·결과 추적, 미확인 중 재mutation 금지 | deadline·예약·단일 효과·terminal 결과·지연 실행 차단 |
| 발췌·수 | server prefix 표시와 실제 visual wrapping overflow 판정 | EGC·논리적 줄 prefix·`isTruncated`·snapshot 기준 활성 수 |
| 수정·삭제 | expected revision 제출, terminal 성공 뒤 화면·로컬 동기화 | ownership·revision·generation·원자 삭제·보존 예외 |
| 분석 | UI 사건 allowlist·best-effort batch | 성공 사건 생성, 주체 파생·중복 제거·보존·삭제 |
| 개인정보 | client cache·Storage·오류 추적에서 민감값 제거 | body/header redaction, no-store, 저장 암호화·접근 제한 |

## 3. 오퍼레이션 인벤토리

| ID | 이름 | 종류 | 주 소비 화면 | 서버 부작용 | 결과 요약 |
|---|---|---|---|---|---|
| [OP-001 · L199–219](#61-op-001-establishsession) | `establishSession` | command-like exchange | F00·F90, 세션 복구 | 세션 발급, passenger 생성 없음 | 세션 mode·만료·현재 정책 |
| [OP-002 · L236–240](#op-002-getpassenger) | `getPassenger` | query | F30, F03/F30 확인 | 없음 | 승객 코드·닉네임·revision |
| [OP-003 · L242–250](#op-003-createpassenger) | `createPassenger` | idempotent command | F02 | 동의 기록과 passenger 원자 생성 | ACTIVE 세션·현재 profile |
| [OP-004 · L252–259](#op-004-setnickname) | `setNickname` | idempotent command | F03·F30 | 닉네임 설정 또는 명시적 해제 | NicknameReceipt |
| [OP-005 · L261–268](#63-op-005-gettoday) | `getToday` | query | F00·F10·F12·F13·F20 | 없음 | 서버 날짜·SEMA·오늘 답변·활성 수 |
| [OP-006 · L270–298](#64-op-006-prepareanswerwrite) | `prepareAnswerWrite` | command prepare | F11·F22 | 대상·날짜·revision 예약, 본문 저장 없음 | answer-write ticket |
| [OP-007 · L340–347](#op-007-executecommand) | `executeCommand` | idempotent command | F11·F22·F23·F31 | ticket 종류에 따른 단일 효과 | `EXECUTING` 또는 terminal result |
| [OP-008 · L349–354](#op-008-getcommandresult) | `getCommandResult` | safe query | F10~F12·F21~F23·F31 | 없음, 부가 정보 보강 가능 | 같은 ticket의 현재 결과 |
| [OP-009 · L356–361](#op-009-acknowledgecommandresult) | `acknowledgeCommandResult` | idempotent command | 결과 처리 완료 뒤 공통 | 민감 result payload 제거 표시 | 204, outcome tombstone 유지 |
| [OP-010 · L365–370](#op-010-listanswers) | `listAnswers` | query | F20 | 없음 | bounded keyset page, 최대 20개 |
| [OP-011 · L372–377](#op-011-getanswer) | `getAnswer` | query | F21·F22·F23 | 없음 | 질문 snapshot·답변 전문·revision |
| [OP-012 · L300–313](#65-op-012-prepareanswerdelete) | `prepareAnswerDelete` | command prepare | F23 | ownership·revision 예약, 삭제 없음 | answer-delete ticket |
| [OP-013 · L315–329](#66-op-013-preparealldatadelete) | `prepareAllDataDelete` | command prepare | F31 | 새 mutation 차단용 deletion fence | data-deletion ticket |
| [OP-014 · L379–381](#69-op-014-submitproducteventbatch) | `submitProductEventBatch` | best-effort command | F00~F31 | 허용된 FE 이벤트 적재 | batch 수락 |
| [OP-015 · L383–389](#610-op-015-closecommand) | `closeCommand` | idempotent recovery command | F11·F22·F23·F31 | 미실행 명령 봉인 또는 만료 명령의 추가 실행 불가 확인 | 현재 command 결과 또는 종료 receipt |

`OP-007~009`는 command 종류와 무관한 공통 lifecycle입니다. OP-015는 사용자 결과 확인/종료 행동의 복구 경로이며 일반 조회나 백그라운드 polling이 임의로 호출하지 않습니다. 신규·수정 저장은 `OP-006`의 discriminated input으로 나누며 별도 화면 API를 만들지 않습니다. 서버가 생성하는 성공 제품 이벤트는 `OP-014`를 거치지 않습니다.

## 4. 15개 화면과 오퍼레이션 연결

| 화면 | 필요한 서버 데이터 | 서버 행동 | OP | 서버 호출이 아닌 행동 |
|---|---|---|---|---|
| F00 | 세션 mode·탑승 상태·정책, ACTIVE이면 오늘 상태 | 익명 키 검증과 세션 발급 | OP-001, ACTIVE이면 OP-005 | route 분기, 로컬 캐시 확인 |
| F01 | 없음 | 없음 | 없음, OP-014는 측정만 | 장면 이동·원문 펼침·건너뛰기 |
| F02 | OP-001의 정책 목록 | 동의+승객 생성 | OP-003 | checkbox·정책 외부 열람 |
| F03 | OP-003 ACTIVE context의 profile | 유효한 비어 있지 않은 값만 닉네임 저장 | 조건부 OP-004 | 빈 값·정규화 후 빈 값·실패 뒤 명시적 건너뛰기 |
| F10 | 오늘 날짜·SEMA 두 질문·응답 상태·수·미확인 결과 | 없음 | OP-005, 조건부 OP-008·009 | 기본/대체 질문 전환·임시본 Sheet·탭 이동 |
| F11 | 선택 질문과 로컬 임시본 | 신규 답변 command | OP-006~009 | 입력·grapheme 표시·임시 보관·복사 |
| F12 | 저장 성공 proof·프로필 발췌·활성 수 | 결과 보조 정보 재확인·ack | OP-008~009, 필요 시 OP-005 | 연출·건너뛰기·햅틱·이동 위계 고정 |
| F13 | 서버 호출 필수 없음 | 없음 | 오늘 이동 뒤 F10이 OP-005 | 지난 임시본 열람·복사·로컬 만료 안내 |
| F20 | OP-010 답변 목록 page, OP-005 활성 누적 수 | 없음 | OP-010, 누적 수는 OP-005 | 월 구획 병합·명시적 더 보기·스크롤 유지 |
| F21 | 질문 snapshot·답변 전문·revision | 미확인 수정 결과 확인 | OP-011, 조건부 OP-008·009 | 읽기·수정/삭제 route 이동 |
| F22 | OP-011 detail과 수정 임시본 | 수정 command | OP-006~009 | 입력·임시 보관·폐기 확인·복사 |
| F23 | OP-011의 대상 문맥 | 개별 삭제 command | OP-012, OP-007~009 | 1회 확인·취소 |
| F30 | profile·현재 정책 | 닉네임 설정·해제 | OP-002·004 | 정책/고객센터 외부 열기·설정 route |
| F31 | 승인된 삭제 범위·보존 예외 | 전체 삭제 command | OP-013, OP-007~009 | 2단계 확인 |
| F90 | 마지막 안전 오류 ID | 원인이 된 시작 query 재시도 | 주로 OP-001·005 | 고객센터 외부 열기 |

OP-003 성공 응답의 ACTIVE 세션을 F03이 이어받습니다. OP-015는 결과 보존 만료나 실행 전 요청 종료에 한해 해당 작성/삭제 화면에서 소비합니다. F00은 session 응답의 최근 삭제 receipt도 확인해 이전 로컬 generation을 먼저 정리합니다.

`OP-014`는 승인된 노출·행동 이벤트가 발생하는 화면에 횡단 적용되며, 기능 요청의 성공이나 이동을 기다리게 하지 않습니다.

## 5. 공통 타입

필드 구조는 [OpenAPI components/schemas](./arca.openapi.json)의 단일 원본을 사용합니다. 생성 타입·런타임 검증기·Mock 구조는 여기서 파생하며 생성 도구 선택은 06이 소유합니다. OpenAPI만으로 검증할 수 없는 EGC·소유권·원자성·시간·값 간 관계는 본문과 API-V의 의미 검증을 함께 적용합니다.

### 5.1 scalar와 nullable

`Instant`는 RFC 3339 UTC(Z), `KstDate`는 YYYY-MM-DD, ID·revision·cursor는 opaque입니다. operation ID는 FE가 생성한 UUID이며 내용을 encode하지 않습니다. `null`은 명시적 부재, 생략은 optional인 필드에서만 허용합니다. JSON의 문자 수 검증으로 EGC 검증을 대신하지 않습니다.

### 5.2 정책·세션·승객

- `EstablishSessionResponse`: access token·만료·`PRE_PASSENGER | ACTIVE | DELETION_RECOVERY` context·현재 정책, 선택적 `recentDeletion` receipt.
- `CreatePassengerResponse`: 명시적 ACTIVE 세션·현재 profile·정책을 반환합니다. 새 token은 효과의 멱등성 대상이 아니며 재응답에서 새로 발급할 수 있습니다.
- `PassengerProfile`: 표시용 승객 코드·nullable 닉네임·revision. 내부 section은 노출하지 않습니다.
- `NicknameReceipt`: operation ID·적용 당시 profile·결과 보존 만료. receipt의 profile은 과거 적용 증명이며 현재 화면은 필요 시 OP-002 정본을 조회합니다.
- `recentDeletion`: 전체 삭제 최소 receipt와 ticket ID를 결과 보존 기한까지만 제공합니다. 기존 active 데이터 조회 권한은 포함하지 않습니다.

### 5.3 SEMA·질문·답변

- `Sema.dailySemaId`는 KST 날짜별 배포 식별자이고 같은 날짜의 콘텐츠 교체에도 유지합니다. `semaId`·`version`은 교체 가능한 콘텐츠 식별자·버전입니다.
- `AnswerCore`에는 dailySemaId와 저장 당시 semaId·semaVersion·semaCode, 질문 ID·버전·role·원문 snapshot, 생성/수정 시각·revision을 보존합니다. 완료 화면의 발신 문맥은 현재 교체 콘텐츠와 섞지 않습니다.
- 발췌 `Excerpt`는 `profile: COMPACT | STANDARD | EXPANDED`, 실제 `limits`(maxGraphemes·maxLogicalLines), `sourceRevision`, `text`, `isTruncated`입니다. 화면별 응답 필드는 공통 `excerpt`를 사용합니다.
- 서버는 선택한 프로필의 실제 예산 안에서 원문 시작부터 가장 긴 연속 prefix를 생성합니다. 빈 줄·공백·개행을 보존하고 EGC 경계에서만 자릅니다. 줄임표는 본문에 넣지 않습니다. FE는 pre-wrap 및 실제 wrapping overflow를 합쳐 생략 여부를 결정합니다.
- 프로필별 현재 예산과 F10/F12/F20 선택의 SSOT는 [04 IX-027 · L217–258](./04_INTERACTIONS_AND_COPY.md#510-발췌날짜동적-값--ix-027ix-028)입니다. OP-005·008·010의 `excerptProfile` query로 선택하며 값 자체를 enum 이름에 넣지 않습니다. 조정한 예산은 배포 설정에 반영하고 응답의 실제 limits를 사용합니다. 전면 본문 조회나 행별 상세 요청으로 우회하지 않습니다.

현행 F20은 질문·날짜만 표시하고 응답은 F21에서 읽습니다(03 §6.1). OP-010의 STANDARD `excerpt`와 기존 query·DTO·revision·privacy 계약은 호환을 위해 그대로 유지합니다. 목록에서 필드를 받는다는 이유로 화면 또는 접근성 이름에 응답 발췌를 노출하지 않습니다. 이번 UI 변경은 wire schema나 서버 동작 변경이 아닙니다.

### 5.4 오늘과 목록

- `TodayReadModel`은 dateKst·오늘 SEMA·오늘 배포 단위의 응답 상태·`activeAnswerCount`를 한 snapshot에서 반환합니다. 콘텐츠가 바뀌어도 해당 dailySemaId의 활성 응답이 있으면 ANSWERED입니다.
- 활성 수는 `Availability<CountSnapshot>`이며 `value.count`와 `value.observedAt`을 함께 사용합니다. 현재 활성 수이고 생애 최초 flag가 아닙니다.
- `AnswerPage`: items·nextCursor·pageSnapshotAt. createdAt DESC, answerId DESC이며 page당 최대 20개입니다. 첫 page의 상한을 cursor에 고정하고 뒤늦은 신규 삽입을 막습니다. 기존 행의 수정은 최신 revision, 삭제는 생략합니다. pageSnapshotAt은 삽입 상한이며 모든 행의 내용을 고정하는 MVCC 시각이 아닙니다.
- 월 구획은 createdDateKst로 FE에서 합칩니다. 없음·삭제·비소유는 상세에서 같은 오류입니다.

### 5.5 command ticket과 결과

| 상태 | 의미 | 다음 행동 |
|---|---|---|
| PREPARED | 대상·날짜 예약 완료, execution 본문은 아직 미수락 | 같은 ticket·보관된 원 payload로 실행, 또는 명시적 OP-015 종료 |
| EXECUTING | 실행 payload 영속 수락, 적용 결과 미확정 | OP-008 조회. executeBy 경과로 실패 추정 금지 |
| SUCCEEDED | 해당 요청의 효과 완료 | 최소 proof로 로컬 정리; 현재 resource와 표시 정보를 별도 동기화 |
| NOT_APPLIED | 해당 요청은 적용되지 않았고 앞으로도 적용 불가 | 오류별 복구 후 새로운 사용자 행동 |
| CLOSED_OUTCOME_UNAVAILABLE | 과거 결과 보존은 끝났으나 이전 명령의 추가 적용이 불가능함을 인증 | 과거 성공/실패 표시 금지, OP-015의 최신 상태를 바탕으로 다음 행동 안내 |

`CommandTicket`에는 ticketId·operationId·kind·target·acceptedAt·acceptedDateKst·executeBy를 고정합니다. 생성 응답은 PREPARED이며 재요청은 같은 ticket의 현재 `CommandResult`를 반환합니다. 실행 후에는 EXECUTING이 될 수 있습니다. resultExpiresAt은 terminal 진입 때 처음 확정하며 PREPARED/EXECUTING에는 넣지 않습니다.

`SUCCEEDED.proof`는 종류별 최소 receipt입니다. 답변 write는 answerId·revision·mode·acceptedDateKst, 개별 삭제는 대상·DELETED/ALREADY_ABSENT·삭제 시각, 전체 삭제는 삭제 시각·보존 예외 종료일을 증명합니다. 질문 원문·발췌·닉네임은 proof에 넣지 않습니다. `NOT_APPLIED.error`의 안정 code·category도 ack 후까지 유지합니다.

표시 정보 `presentation`은 AVAILABLE/UNAVAILABLE/ACKNOWLEDGED/RESOURCE_CHANGED로 분리합니다. AVAILABLE 안의 발췌와 활성 수도 독립 availability를 갖습니다. 발췌·질문 snapshot은 proof의 revision과 같을 때만 보강하며, 수정·삭제로 달라졌으면 RESOURCE_CHANGED를 반환하고 OP-005·010·011로 현재 상태를 조회합니다. 과거 성공을 취소하거나 새 원문을 옛 revision에 결합하지 않습니다. 활성 수는 조회 당시 observedAt을 표시 의미로 사용합니다. ack로 presentation을 제거해도 proof와 오류는 resultExpiresAt까지 유지합니다.

## 6. 도메인 오퍼레이션 계약

### 6.1 OP-001 `establishSession`

```ts
type EstablishSessionInput = {
  anonymousKey: string
}
```

1. FE는 앱인토스가 반환한 유효 `HASH`만 전송합니다. SDK 오류·미지원·`INVALID_CATEGORY`·빈 값에는 passenger 생성이나 임의 키 fallback을 하지 않고 F90으로 이동합니다.
2. ARCA 서버는 partner server 자격과 mTLS로 앱인토스 서버에 키를 검증한 뒤에만 세션을 발급합니다.
3. 유효하지만 ARCA에 등록되지 않았거나 이전과 다른 유효 hash는 `PRE_PASSENGER`, 기존 활성 passenger와 연결된 같은 hash는 기기 변경과 무관하게 `ACTIVE`입니다. 현재 호출에서 유효 hash를 받지 못한 상태와 유효하지만 미등록인 hash를 구분합니다.
4. 전체 삭제가 실행 중이거나 성공했지만 결과가 아직 acknowledgement·만료되지 않은 키는 `DELETION_RECOVERY`이며 해당 삭제 ticket의 OP-008·009·015와 이미 수락한 OP-007의 동일 payload 재전송만 허용합니다. 일반 요청이나 새로운 실행은 허용하지 않습니다. 삭제 `NOT_APPLIED` 뒤에는 기존 passenger의 `ACTIVE`, 성공 결과 ack·만료 뒤에는 새 `PRE_PASSENGER`를 발급합니다.
5. access token은 opaque이고 `expiresAt`을 반환합니다. refresh token과 cookie는 사용하지 않습니다.
6. `SESSION_RECOVERY_REQUIRED`와 `recoveryAllowed: true`를 서버가 명시한 경우에만 FE가 익명 키 재검증 뒤 같은 요청을 한 번 자동 재시도합니다. timeout이나 임의 401 추정으로 복구하지 않습니다.
7. 재교환 뒤 dataGeneration이 바뀌거나 PRE_PASSENGER로 바뀌면 이전 generation의 mutation 자동 재시도를 중단하고 로컬 소유 영역을 정리합니다. OP-003의 PRE→ACTIVE 동일 생성 복구와 해당 삭제 receipt 확인만 명시적 예외입니다. command 실행 재시도는 반드시 같은 ticket·generation이어야 하며 새 command를 만들지 않습니다.

닉네임·passenger code를 이용한 로그인, 복구 code, 별도 계정 연결과 수동 복구 endpoint는 MVP에 두지 않습니다. 익명 키가 바뀌면 삭제 전 passenger와 기록을 합치지 않습니다.

새 session 응답을 로컬 복구보다 먼저 확인합니다. PRE_PASSENGER이거나 ACTIVE의 dataGeneration이 기존 로컬 소유 영역과 다르면 이전 generation의 민감 cache·임시본·추적 상태를 제거하고 그 결과를 새 generation에 적용하지 않습니다. 이 정리는 과거 개별 command의 성공/실패를 새로 주장하지 않습니다. recentDeletion.deletedGeneration은 같은 이전 영역을 확인하는 최소 식별자이며 비밀이나 인증 수단이 아닙니다.

원본 익명 키는 이 요청의 JSON body 외에 URL·query·분석·로그·오류·영속 클라이언트 저장에 포함하지 않습니다. 서버 내부 연결 방식과 암호화 키 관리는 백엔드 책임입니다.

### 6.2 OP-002~004 passenger와 닉네임

```ts
type CreatePassengerInput = {
  operationId: OperationId
  consents: ConsentReceiptInput[]
}

type SetNicknameInput = {
  operationId: OperationId // HTTP에서는 Idempotency-Key
  nickname: string | null
  expectedRevision: Revision
}
```

#### OP-002 `getPassenger`

- `ACTIVE` 세션의 현재 `PassengerProfile`을 반환합니다.
- `PRE_PASSENGER`에는 `PASSENGER_NOT_FOUND`를 반환하며 데이터를 만들지 않습니다.
- 닉네임 timeout 뒤 현재 profile을 조회할 수 있지만 특정 요청의 적용 증명으로 사용하지 않습니다. OP-004의 같은 key·입력 재전송으로 receipt를 복원합니다.

#### OP-003 `createPassenger`

- 모든 현재 필수 정책의 정확한 ID·version 동의와 passenger 생성을 한 트랜잭션으로 처리합니다.
- 동의 시각은 서버가 기록하며 FE가 보내지 않습니다.
- 제출 중 정책이 바뀌면 passenger를 만들지 않고 `POLICY_VERSION_CHANGED`와 최신 정책 목록을 반환합니다.
- 서버가 passenger code와 내부 section을 배정하되 응답에는 section을 포함하지 않습니다.
- 같은 operation ID·동의 입력은 같은 passenger 생성 효과를 재사용하고 ACTIVE 세션을 포함한 CreatePassengerResponse를 반환합니다. PRE_PASSENGER와 같은 주체의 ACTIVE 모두 재전송할 수 있으며 fingerprint 확인을 현재 정책 검증보다 먼저 수행합니다. 정책이 이후 변경돼도 이미 완료된 동의를 재생성하지 않습니다.
- OP-003은 기존 PRE token을 폐기하고 ACTIVE token을 발급합니다. 응답 유실로 PRE token이 폐기된 경우 OP-001 재교환 뒤 같은 operation ID로 복구합니다. ACTIVE에서 새 key로 요청하면 PASSENGER_ALREADY_EXISTS이며 OP-002로 현재 profile을 확인합니다.
- F02 성공이 탑승 완료입니다. F03 닉네임은 이 트랜잭션에 포함하지 않습니다.

#### OP-004 `setNickname`

- `nickname: null`은 기존 닉네임의 명시적 해제입니다. 필드 생략은 허용하지 않습니다.
- 문자열은 앞뒤 공백을 제거한 뒤 Unicode 확장 grapheme 2~12자여야 합니다. 줄바꿈·제어·보이지 않는 문자만 거절하고 중복·이모지는 허용합니다.
- F03의 빈 값·정규화 뒤 빈 값·저장 확정 실패 뒤 `닉네임 없이 계속하기`에는 요청을 보내지 않습니다.
- F30에서 지우기는 `null`을 전송합니다.
- 같은 주체·generation·operation ID·입력 재전송은 revision 재검증 전에 같은 NicknameReceipt를 재사용합니다. 첫 요청의 expectedRevision이 다르면 REVISION_CONFLICT이며 명령 효과는 없습니다.
- 결과는 완료 후 7일간 보존합니다. 이후 같은 key는 OPERATION_RESULT_EXPIRED로 거절하며 재실행하지 않습니다. 최소 key/fingerprint 봉인 정보는 현 generation 수명까지만 유지하고 전체 삭제 시 제거합니다. 현재 profile 확인 뒤 사용자가 새로 저장하면 새 key·최신 revision을 사용합니다. 전체 삭제 fence는 OP-004도 차단합니다.

### 6.3 OP-005 `getToday`

- 한 응답에서 서버의 `dateKst`, 같은 날짜의 공통 SEMA, 오늘 답변 상태와 활성 답변 수를 반환합니다. F00은 OP-001이 ACTIVE를 반환한 경우 이 query를 별도로 수행해 Flow가 요구하는 시작 상태를 확인하며, F10은 전달된 정본을 소비하거나 stale/부재 시 다시 조회합니다.
- 미응답이면 기본·대체 질문을 둘 다 반환하고 기본 질문을 먼저 표시하는 것은 FE 책임입니다.
- 응답 완료면 저장 당시 질문 snapshot과 요청한 프로필의 발췌를 반환하며 새 질문 선택 상태를 만들지 않습니다.
- 오늘 답변 삭제 성공 뒤 같은 날짜의 재조회는 `UNANSWERED`와 현재 SEMA 두 질문을 반환합니다.
- 운영 SEMA가 예비 SEMA로 바뀌면 dailySemaId는 유지하고 새 semaId·version을 반환합니다. 기존 활성 답변의 완료 상태·저장 당시 콘텐츠 문맥은 유지합니다. 이전 질문 임시본을 새 질문에 자동 전용하지 않습니다. 같은 배포 단위 저장 성공 시 이전 콘텐츠를 포함한 그 날짜 질문 임시본을 제거합니다.
- 미확인 command의 존재는 저장 완료로 간주하지 않습니다. FE가 보관한 ticket이 있으면 OP-008을 먼저 호출합니다.

### 6.4 OP-006 `prepareAnswerWrite`

```ts
type PrepareAnswerWriteInput =
  | {
      operationId: OperationId
      mode: "CREATE"
      dailySemaId: EntityId
      semaId: EntityId
      semaVersion: string
      questionId: EntityId
      questionVersion: string
    }
  | {
      operationId: OperationId
      mode: "UPDATE"
      answerId: EntityId
      expectedRevision: Revision
    }
```

- prepare는 본문을 받거나 저장하지 않습니다.
- `CREATE`는 수락 순간 서버 KST 날짜·활성 SEMA·정본 질문·한 활성 답변 제약을 확인하고 승객·dailySemaId write slot을 예약합니다.
- 클라이언트가 질문 원문을 보내지 않습니다. 서버가 `questionId`·version에 해당하는 정본을 snapshot 후보로 고정합니다.
- `UPDATE`는 소유권과 `expectedRevision`을 고정합니다. 저장 당시 질문 snapshot은 바꾸지 않습니다.
- 같은 대상의 기존 미결 command가 있으면 새 ticket을 만들지 않고 `COMMAND_ALREADY_PENDING`과 복구 가능한 ticket ID를 반환합니다.
- executeBy는 실행 payload 최초 영속 수락 기한입니다. PREPARED에서 기한이 지나면 예약을 해제하고 NOT_APPLIED / COMMAND_EXPIRED로 끝냅니다. 실행 수락과 만료/OP-015는 같은 원자적 상태 전이로 경쟁하며 한쪽만 이깁니다. EXECUTING은 기한 경과로 취소하지 않고 실제 commit 또는 rollback까지 결과를 추적합니다.
- prepare 응답 유실로 ticketId가 없으면 기기에 먼저 보관한 operation ID·동일 prepare 입력으로 재전송해 현재 CommandResult를 복원합니다. 새 operation ID를 만들지 않습니다. 이 재전송은 아직 미수락이었다면 예약을 처음 생성할 수 있으나 본문을 실행하지는 않습니다.
- 재진입의 PREPARED 실행은 원 저장 의도와 정확한 보관 payload가 확인될 때만 같은 ticket으로 수행합니다. 본문이 없거나 바뀌었으면 자동 실행하지 않고 OP-015로 종료한 뒤 사용자 재시도를 받습니다.

### 6.5 OP-012 `prepareAnswerDelete`

```ts
type PrepareAnswerDeleteInput = {
  operationId: OperationId
  answerId: EntityId
  expectedRevision: Revision
}
```

- prepare 시 ownership·현재 revision을 확인하고 ticket에 고정합니다.
- 처음부터 없거나 삭제됐거나 비소유인 대상은 모두 `ANSWER_NOT_FOUND`입니다.
- prepare 뒤 같은 revision이 다른 삭제로 먼저 사라지면 실행 결과는 `SUCCEEDED / ALREADY_ABSENT`입니다.
- prepare 뒤 내용이 수정돼 revision이 달라지면 `NOT_APPLIED / REVISION_CONFLICT`이며 수정된 답변을 삭제하지 않습니다.

### 6.6 OP-013 `prepareAllDataDelete`

```ts
type PrepareAllDataDeleteInput = {
  operationId: OperationId
}
```

- `ACTIVE` 세션만 준비할 수 있습니다.
- prepare 성공부터 같은 passenger의 OP-004 및 새 write/delete 준비·기존 PREPARED 실행을 차단합니다. 이미 EXECUTING인 변경이 있으면 prepare 자체를 COMMAND_ALREADY_PENDING으로 거절합니다. 이미 예약된 command는 삭제 성공 때 폐기하며, 삭제 예약 만료/미적용이면 원래 기한 안에서만 재개할 수 있습니다. 삭제 기한 안에 실행되지 않으면 fence를 해제하고 COMMAND_EXPIRED로 끝냅니다.
- 실행을 수락하면 현재 normal session을 폐기하고 다음 OP-001은 처리 중에 `DELETION_RECOVERY`를 발급합니다.
- 성공 범위는 활성 답변·발췌·passenger profile·닉네임·설정·활성 동의 연결·linkable raw analytics와 서버 idempotency payload입니다.
- 성공 뒤 접근권한과 논리 영역을 분리한 증빙 저장소에는 약관 종류·버전·동의 시각·삭제 시각·가명 동의 주체값만 1년 보존합니다. 백업은 복구에 사용하지 않고 요청일부터 최대 30일 안에 만료합니다.
- MVP의 삭제 대상 활성 데이터·linkable raw analytics·command 제어 정보와 분리된 동의 증빙은 하나의 ACID 트랜잭션 경계에서 변경합니다. 동의 증빙은 접근권한·논리 저장 영역을 분리하되 동일 트랜잭션을 지원해야 합니다. 상세 제약은 §10.3을 따릅니다.
- 삭제 commit 전 rollback은 NOT_APPLIED / ALL_DATA_DELETE_FAILED로 기존 활성 데이터를 유지합니다. commit과 SUCCEEDED receipt를 원자적으로 기록합니다. 응답 유실은 실패가 아니며 EXECUTING 조회로 실제 commit 여부를 복원합니다. 비가역 삭제 뒤 복원을 보장하는 분산 보상 방식은 기본 구현으로 채택하지 않습니다.

### 6.7 OP-007~009 공통 command lifecycle

```ts
type ExecuteCommandInput =
  | { kind: "ANSWER_WRITE"; content: string }
  | { kind: "ANSWER_DELETE" }
  | { kind: "ALL_DATA_DELETE" }
```

#### OP-007 `executeCommand`

- ticket에 저장된 kind·passenger·target·revision·generation과 input kind를 대조합니다.
- answer content는 trim·축약하지 않고 Unicode 확장 grapheme 1~2,000자로 검증·저장합니다. 결합 이모지는 한 EGC, 논리적 줄바꿈 하나는 한 EGC이며 공백만 있는 문자열도 유효합니다.
- wire 형식은 맞지만 content domain 검증이 실패한 첫 실행은 `NOT_APPLIED / ANSWER_CONTENT_INVALID`로 terminal 처리합니다. 같은 ticket에 내용을 고쳐 재실행하지 않고 현재 날짜의 새 prepare가 필요합니다.
- 처음 수락한 실행 payload의 digest를 ticket에 고정합니다. 같은 ticket 실행은 최초 효과와 결과를 재사용하고, 다른 content로 재사용하면 적용하지 않고 `COMMAND_PAYLOAD_MISMATCH`를 반환합니다.
- 서버가 즉시 끝냈으면 terminal 결과, 비동기 처리 중이면 `EXECUTING`을 반환합니다.
- 응답 유실은 결과 유실이 아닙니다. FE는 OP-008을 사용합니다.

#### OP-008 `getCommandResult`

- 데이터 변경이 없는 safe query이며 §5.5의 다섯 상태를 반환합니다. 조회가 PREPARED를 실행하거나 취소하지 않습니다. 서버 만료 처리는 별도 worker/트랜잭션 책임입니다.
- PREPARED·EXECUTING·조회 timeout·CLOSED_OUTCOME_UNAVAILABLE을 NOT_APPLIED로 바꾸지 않습니다.
- answer write proof는 불변이고 표시 정보만 §5.5의 revision·observedAt 규칙으로 보강합니다.
- normal session 폐기 뒤 전체 삭제 ticket은 처리 중과 terminal 성공의 ack·만료 전까지 같은 익명 키로 얻은 `DELETION_RECOVERY` 세션에서 조회할 수 있습니다.

#### OP-009 `acknowledgeCommandResult`

- terminal 결과의 최소 proof/오류를 기기에 보관하고, 그 결과에 따른 캐시·임시본 정리를 안전하게 끝낸 뒤 ack합니다. PREPARED/EXECUTING ack는 409 COMMAND_NOT_TERMINAL입니다.
- 권한과 receipt/봉인 정보가 유지되는 동안 중복 ack는 204입니다. 전체 삭제 receipt 만료 등으로 정보가 제거된 뒤에는 COMMAND_NOT_FOUND이며 결과 증거로 사용하지 않습니다. ack는 민감 presentation만 제거하고 최소 proof·안정 오류와 멱등성은 resultExpiresAt까지 유지합니다. 다른 기기는 ACKNOWLEDGED 뒤에도 결과를 처리하고 현재 resource를 재조회할 수 있습니다.
- 전체 삭제는 SUCCEEDED 확인 → 이전 generation의 본문·발췌·임시본·분석 queue·일반 세션 제거 → 제한 recovery token으로 ack 시도 → 제한 token 제거·F01 순서입니다. ack 전 종료/응답 유실은 같은 키의 OP-001로 복구하며 삭제 성공을 취소하거나 재삭제하지 않습니다. ack 실패만으로 F01 이동을 막지 않습니다.
- 전체 삭제 ack 후 OP-001은 PRE_PASSENGER(이후 재탑승했다면 ACTIVE)와 recentDeletion을 resultExpiresAt까지 반환합니다. 해당 제한 receipt의 OP-008·009만 추가로 허용하고 과거 데이터 접근은 허용하지 않습니다. 다른 기기는 자신의 이전 ticket과 대조하고 오래된 로컬 영역만 정리하며 새 generation 상태를 지우지 않습니다.

### 6.8 OP-010~011 답변 조회

#### OP-010 `listAnswers`

- 첫 요청에는 cursor가 없고 이후에는 직전 응답의 불투명 `nextCursor`만 전달합니다.
- cursor는 passenger, data generation, 첫 page 상한, 마지막 `createdAt`·answer ID를 서버에서 무결성 보호합니다.
- 다른 passenger·generation의 cursor, 변조·만료 cursor는 `CURSOR_INVALID`입니다.
- 새 답변은 진행 중 page chain에 끼우지 않고 새로고침 뒤 표시합니다. 삭제된 항목은 생략하며 중복 행을 만들지 않습니다.

#### OP-011 `getAnswer`

- 현재 passenger·generation이 소유한 답변만 `AnswerDetail`로 반환합니다.
- 저장 당시 질문 snapshot 전문과 답변 원문을 반환합니다.
- 없음·삭제됨·비소유를 `ANSWER_NOT_FOUND`로 통합합니다.
- 상세 응답과 본문은 HTTP·서비스 워커 cache에 저장하지 않습니다.

### 6.9 OP-014 `submitProductEventBatch`

상세 event source·DTO·allowlist·보존 정책은 §11에서 정의합니다. 이 요청은 화면의 정상 행동을 차단하지 않으며 앱이 임의의 이벤트 이름·속성을 추가할 수 없습니다.

### 6.10 OP-015 `closeCommand`

- 인증된 소유 ticket에 대한 idempotent 복구 명령입니다. 본문 `{}`이며 UI의 명시적 요청 종료 또는 만료 결과 정리 행동에서만 호출합니다.
- PREPARED이면 실행 수락과 원자적으로 경쟁해 NOT_APPLIED / COMMAND_CLOSED를 기록합니다. EXECUTING이면 202의 같은 상태를 반환하고 강제 취소하지 않습니다. terminal 보존 중이면 기존 결과를 반환합니다.
- 결과 보존 만료 뒤에는 최소 봉인 registry로 과거 명령의 추가 실행 불가를 검증하고 CLOSED_OUTCOME_UNAVAILABLE과 reconciliation을 반환합니다. registry조차 없거나 비소유이면 COMMAND_NOT_FOUND이며 미적용·종료 증거로 사용하지 않습니다.
- reconciliation은 checkedAt, `CREATE_CURRENT_DAY | REVIEW_CURRENT_ANSWER | RETURN_TODAY | RETURN_ARCHIVE` 중 nextAction, 필요 시 현재 answerId·revision을 포함합니다. 서버는 현재 날짜·해당 dailySemaId 활성 답변·대상 존재·미결 경쟁 명령을 같은 snapshot에서 확인합니다. 경쟁 명령은 COMMAND_ALREADY_PENDING과 ticket을 반환합니다. 전체 삭제 성공 뒤의 정상 작업 재개는 OP-001의 현재 generation으로만 합니다.
- nextAction은 그 snapshot의 안내이며 새 변경의 허가 토큰이 아닙니다. 다음 사용자 저장/삭제는 새 ID·최신 날짜·revision으로 다시 검증합니다. 과거 요청의 성공·실패를 추정하거나 자동 재저장하지 않습니다.

## 7. HTTP wire 계약

### 7.1 base URL과 공통 형식

- 운영·개발 host는 환경 설정으로 주입하며 이 저장소에는 실제 값이 없습니다.
- 모든 ARCA 경로는 HTTPS의 `<ARCA_API_BASE>/v1` 아래에 둡니다.
- 성공 body는 불필요한 `{ "data": ... }` wrapper 없이 해당 DTO를 직접 반환합니다.
- 오류 body만 `{ "error": ApiError }` envelope를 사용합니다.
- JSON 필드는 `camelCase`, 문자열 encoding은 UTF-8입니다.
- private 응답과 session 응답은 `Cache-Control: no-store`를 반환합니다. 오류 envelope도 같은 정책을 적용합니다.
- 인증 cookie를 사용하지 않으며 실제 미니앱 origin만 CORS allowlist에 둡니다. 인증 요청에 wildcard origin을 사용하지 않습니다.

```text
Content-Type: application/json; charset=utf-8
Authorization: Bearer <opaque-access-token>
Idempotency-Key: <operation-id>  # prepare/create 및 nickname에 사용
```

access token과 anonymous key는 query, URL path, referrer와 오류 정보에 넣지 않습니다.

### 7.2 endpoint 지도

| OP | Method·path | 인증 mode | 입력 | 성공 상태·body |
|---|---|---|---|---|
| OP-001 | `POST /v1/sessions` | 없음 | `EstablishSessionInput` | `201 EstablishSessionResponse` |
| OP-002 | `GET /v1/passenger` | ACTIVE | 없음 | `200 PassengerProfile` |
| OP-003 | `POST /v1/passenger` | PRE_PASSENGER 또는 같은 주체 ACTIVE 재요청 | `Idempotency-Key`, consent body | `201/200 CreatePassengerResponse` |
| OP-004 | `PUT /v1/passenger/nickname` | ACTIVE | `Idempotency-Key`, SetNicknameInput body | `200 NicknameReceipt` |
| OP-005 | `GET /v1/today` | ACTIVE | excerptProfile query(선택) | `200 TodayReadModel` |
| OP-006 | `POST /v1/answer-write-commands` | ACTIVE | `Idempotency-Key`, prepare body | `201/200 CommandResult` |
| OP-007 | `PUT /v1/commands/{ticketId}/execution` | ticket owner | 종류별 execution body | `200 terminal` 또는 `202 EXECUTING` |
| OP-008 | `GET /v1/commands/{ticketId}` | ACTIVE·해당 DELETION_RECOVERY·recentDeletion 제한 권한 | excerptProfile query(선택) | `200 CommandResult` |
| OP-009 | `PUT /v1/commands/{ticketId}/acknowledgement` | OP-008과 같음 | `{}` | `204` |
| OP-010 | `GET /v1/answers?cursor={cursor}` | ACTIVE | cursor·excerptProfile query(선택) | `200 AnswerPage` |
| OP-011 | `GET /v1/answers/{answerId}` | ACTIVE | 없음 | `200 AnswerDetail` |
| OP-012 | `POST /v1/answer-delete-commands` | ACTIVE | `Idempotency-Key`, prepare body | `201/200 CommandResult` |
| OP-013 | `POST /v1/data-deletion-commands` | ACTIVE | `Idempotency-Key`, `{}` | `201/200 CommandResult` |
| OP-014 | `POST /v1/analytics/event-batches` | PRE_PASSENGER 또는 ACTIVE | `ProductEventBatchInput` | `202` |
| OP-015 | `PUT /v1/commands/{ticketId}/closure` | ACTIVE 또는 해당 DELETION_RECOVERY | `{}` | `200 CommandResult` 또는 `202 EXECUTING` |

같은 `Idempotency-Key`의 재요청은 처음 생성한 resource를 `200`으로 반환할 수 있습니다. 최초 생성 여부와 무관하게 response DTO는 같습니다. 같은 key를 다른 의미·입력에 사용하면 `409 IDEMPOTENCY_KEY_REUSED`입니다.

§6의 domain input에 표시한 `operationId`는 HTTP에서 `Idempotency-Key` header로 mapping하며 JSON body에 중복하지 않습니다. `SetNicknameInput`도 Idempotency-Key가 필수이며 wire body에는 nickname·expectedRevision만 둡니다. prepare 재전송은 최초 PREPARED DTO에 고정되지 않고 같은 ticket의 현재 상태를 반환합니다.

### 7.3 session 교환 예시

요청 예시는 합성값이며 운영 키가 아닙니다.

```http
POST /v1/sessions HTTP/1.1
Content-Type: application/json; charset=utf-8

{
  "anonymousKey": "synthetic-anonymous-key-for-contract-test"
}
```

```json
{
  "accessToken": "opaque-session-token",
  "expiresAt": "2026-09-14T00:00:00Z",
  "context": {
    "mode": "PRE_PASSENGER",
    "passenger": null
  },
  "consentPolicies": [
    {
      "policyId": "terms-of-service",
      "version": "synthetic-v1",
      "title": "서비스 이용약관",
      "url": "https://policy.invalid.example/for-contract-only",
      "required": true
    }
  ]
}
```

`policy.invalid.example`은 wire 형태를 설명하는 비운영 합성값이며 구현 placeholder로 사용하면 안 됩니다.

### 7.4 answer write 예시

prepare에는 dailySemaId·현재 콘텐츠/질문 ID·version을 보내고 본문을 포함하지 않습니다. execution에는 kind와 원 content만 보냅니다. 합성 PREPARED·EXECUTING·terminal·ack·만료 예시는 [contract_examples.json](./contract_examples.json)에서 schema에 대해 검증합니다. 예시는 데이터 구조의 원본이 아니며 개인정보나 실제 API host를 포함하지 않습니다.

### 7.5 상태 코드

| HTTP | 의미 | 자동 재시도 |
|---|---|---|
| 200 | 조회·PUT 성공 또는 command의 현재/terminal 표현 | 조회만 `06` 정책 범위, mutation 임의 재시도 금지 |
| 201 | session·passenger·command ticket 최초 생성 | 응답 유실 시 같은 idempotency key만 허용 |
| 202 | 실행 또는 event batch 수락, 아직 비동기 처리 중 | command는 OP-008 조회, event는 UI에서 재시도 의무 없음 |
| 204 | acknowledgement 완료 | 중복 PUT 허용 |
| 400 | JSON·wire schema·cursor 형식 오류 | 수정 전 금지 |
| 401 | session 없음·만료·무효 | `SESSION_RECOVERY_REQUIRED`가 허용한 경우만 1회 |
| 403 | 현재 session mode로 operation 금지 | 금지 |
| 404 | resource 없음 또는 비소유 통합 | 임의 재시도 금지 |
| 409 | revision·idempotency·진행 중 command 충돌 | recovery 정보에 따라 조회 |
| 422 | 값 검증·날짜·SEMA·정책 version 거절 | 입력/정본 갱신 뒤 새 사용자 행동 필요 |
| 429 | rate limit | `Retry-After`와 `06` 정책 적용 |
| 500 | 안전한 일반 서버 오류 | mutation 결과 추정 금지 |
| 503 | 점검·일시적 사용 불가 | `Retry-After`와 사용자 재시도 |

영속 command의 `NOT_APPLIED`는 HTTP 오류가 아니라 `GET /commands/{ticketId}`의 `200 CommandResult`입니다. JSON/필수 wire schema 오류는 400 INVALID_REQUEST, 유효한 kind가 ticket 종류와 다른 경우는 422 COMMAND_PAYLOAD_MISMATCH이며 ticket이 아직 실행되지 않았다면 PREPARED로 남습니다. wire는 유효하지만 answer content domain 검증이 실패하면 같은 ticket을 고쳐 재실행하지 못하도록 terminal `NOT_APPLIED`로 저장합니다.

### 7.6 wire 호환성

OpenAPI의 닫힌 오류 allowlist는 서버 출력 검증 기준입니다. FE는 알려진 code의 허용 필드만 추출한 뒤 검증하여 추가 필드를 버리고 UI/로그에 전달하지 않습니다. 필수 필드·enum·허용 필드의 타입 오류를 지우거나 정상값으로 바꾸지는 않습니다.

- 클라이언트는 알 수 없는 추가 object 필드를 무시합니다.
- 필수 필드 누락·타입 불일치·현재 계약에 없는 필수 enum은 `PROTOCOL_ERROR`로 정규화합니다.
- `PROTOCOL_ERROR`는 FE 경계 오류이며 서버가 사용자에게 보낼 code가 아닙니다.
- 기존 enum에 새 의미를 추가해야 하면 구버전 FE의 처리 가능성을 확인하고 필요하면 `/v2`를 사용합니다.
- 날짜 전용 값을 UTC instant로 대신하거나 cursor를 offset 숫자로 노출하는 변경은 호환 변경이 아닙니다.

## 8. 오류 계약

### 8.1 공통 envelope

오류 envelope와 code별 recovery는 OpenAPI의 `ApiErrorEnvelope`·`ApiError` discriminated union을 사용합니다. code·category·requestId는 필수이며 임의 `details`·message·stack은 허용하지 않습니다. SESSION_RECOVERY_REQUIRED의 REESTABLISH_SESSION, POLICY_VERSION_CHANGED의 정책 목록, COMMAND_ALREADY_PENDING의 ticket, DATE_CHANGED/SEMA_REPLACED의 REFRESH_TODAY만 code별로 허용합니다. rate limit/maintenance만 retryAfterSeconds를 허용하며 Retry-After와 일치해야 합니다.

requestId는 서버의 무작위 비식별 진단값입니다. 오류의 알려지지 않은 추가 필드를 FE가 UI나 로그에 전달하지 않습니다. code·category·recovery 조합 오류는 PROTOCOL_ERROR입니다. terminal error는 민감값 없는 안정 code·category만 유지합니다.

### 8.2 안정 오류 registry

| Code | Category | HTTP/결과 | 적용 OP | 확정 의미·허용 recovery |
|---|---|---|---|---|
| `INVALID_REQUEST` | VALIDATION | 400 | 공통 | wire 형식 거절, 서버 부작용 없음 |
| `ANONYMOUS_KEY_INVALID` | AUTH | 401 | OP-001 | 검증 실패, passenger·session 생성 없음 |
| `SESSION_RECOVERY_REQUIRED` | AUTH | 401 | OP-002~015 | `recoveryAllowed: true`, OP-001 뒤 동일 요청 최대 1회 |
| `SESSION_INVALID` | AUTH | 401 | OP-002~015 | 자동 복구 지시 없음, 입력 보존 뒤 F90/재진입 |
| `SESSION_SCOPE_INSUFFICIENT` | AUTH | 403 | OP-002~015 | 현재 mode에서 금지, mutation 재시도 금지 |
| `PASSENGER_NOT_FOUND` | VALIDATION | 404 | OP-002 | passenger 생성 없음 |
| `PASSENGER_ALREADY_EXISTS` | CONFLICT | 409 | OP-003 | OP-002로 기존 profile 확인 |
| `CONSENT_REQUIRED` | VALIDATION | 422 | OP-003 | 필수 동의 부족, passenger 생성 없음 |
| `POLICY_VERSION_CHANGED` | VALIDATION | 422 | OP-003 | 최신 정책 목록으로 F02 갱신, 생성 없음 |
| `NICKNAME_INVALID` | VALIDATION | 422 | OP-004 | 원 입력 유지, profile 변경 없음 |
| `ANSWER_CONTENT_INVALID` | VALIDATION | terminal `NOT_APPLIED` | OP-007 | 본문 1~2,000 EGC 위반, ticket 영구 미적용 |
| `DATE_CHANGED` | VALIDATION | 422 | OP-006 | 과거 신규 저장 prepare 거절, F13 연결 |
| `SEMA_REPLACED` | VALIDATION | 422 | OP-006 | 이전 SEMA 신규 저장 prepare 거절, OP-005 갱신 |
| `ANSWER_ALREADY_EXISTS` | CONFLICT | 409 | OP-006 | 같은 passenger·SEMA의 활성 답변 유지 |
| `ANSWER_NOT_FOUND` | VALIDATION | 404 또는 terminal | OP-007·011~012 | 없음·삭제·비소유 통합, 대상 변경 없음 |
| `REVISION_CONFLICT` | CONFLICT | 409 또는 terminal | OP-004·006~007·012 | 최신 resource 조회 전 재mutation 금지 |
| `CURSOR_INVALID` | VALIDATION | 400 | OP-010 | 첫 page 새로고침 필요 |
| `COMMAND_ALREADY_PENDING` | CONFLICT | 409 | OP-004·006·007·012·013·015 | `QUERY_COMMAND`로 기존 ticket 확인 |
| `COMMAND_NOT_FOUND` | VALIDATION | 404 | OP-007~009 | 다른 소유자와 없음·만료를 구분 노출하지 않음 |
| `COMMAND_PAYLOAD_MISMATCH` | VALIDATION | 422 | OP-007 | 적용 없음, 올바른 같은 ticket만 실행 가능 |
| `IDEMPOTENCY_KEY_REUSED` | CONFLICT | 409 | OP-003·004·006·012·013 | 다른 payload 재사용, 적용 없음 |
| `COMMAND_CLOSED` | CONFLICT | terminal `NOT_APPLIED` | OP-015 | 실행 전 원자적 봉인 완료 |
| `COMMAND_NOT_TERMINAL` | CONFLICT | 409 | OP-009 | 아직 ack 불가, 결과 조회 |
| `OPERATION_RESULT_EXPIRED` | CONFLICT | 409 | OP-004 | 과거 nickname key 재실행 불가, 현재 profile 확인 |
| `COMMAND_EXPIRED` | CONFLICT | terminal `NOT_APPLIED` | OP-007·008 | 실행 기한 뒤 영구 미적용 |
| `ALL_DATA_DELETE_FAILED` | MAINTENANCE | terminal `NOT_APPLIED` | OP-007·008 | 단일 트랜잭션 rollback 완료, 활성 데이터 삭제 없음 |
| `RATE_LIMITED` | RATE_LIMIT | 429 | 공통 | `Retry-After`, 현재 입력·목록 유지 |
| `MAINTENANCE` | MAINTENANCE | 503 | 공통 | 현재 입력·목록 유지, 사용자 재시도 |
| `INTERNAL_ERROR` | MAINTENANCE | 500 | 공통 | 원인 비노출, mutation 결과는 ticket으로만 확인 |

`DATE_CHANGED`, `SEMA_REPLACED`, `ANSWER_ALREADY_EXISTS`는 신규 저장 prepare에서만 판정합니다. 한 번 수락된 create ticket은 실행 때 날짜·SEMA를 다시 평가하지 않으며 executeBy·generation fence·예약/유일성 보호를 적용합니다. `ANSWER_NOT_FOUND`와 `REVISION_CONFLICT`는 prepare 전에 HTTP 오류일 수 있고, 유효 prepare 뒤 대상이 삭제·수정된 경우에는 terminal `NOT_APPLIED.error`가 됩니다.

### 8.3 결과 확실성

| 관찰한 결과 | FE가 확정할 수 있는 것 | 다음 행동 |
|---|---|---|
| prepare의 인증된 4xx envelope | 그 거절 요청은 새 ticket을 만들지 않음; 기존 ticket 유무는 code에 따름 | COMMAND_ALREADY_PENDING은 해당 ticket 조회, 나머지는 code별 복구 |
| execution `SUCCEEDED` | 명시된 단일 효과 완료 | 성공 화면·캐시 동기화 |
| execution `NOT_APPLIED` | 해당 ticket이 앞으로도 적용되지 않음 | 입력 유지·오류별 복구 |
| PREPARED | 본문 미수락, 예약 존재 | 동일 payload 실행 또는 명시적 종료 |
| EXECUTING | 실행 수락, 성공/미적용 미확정 | OP-008 유한 조회 |
| CLOSED_OUTCOME_UNAVAILABLE | 과거 outcome 미확인, 추가 실행 불가 | 명시적 OP-015 정리·최신 상태 확인 |
| timeout·connection error·응답 parse 실패 | 적용 여부 알 수 없음 | ticket이 있으면 OP-008; prepare 응답 유실이면 같은 ID·입력으로 ticket 복원 |
| command 조회 부재·timeout | 미적용을 뜻하지 않음 | 추적 상태·본문 보관, 재조회/지원 경로 |

오직 서버가 인증된 SUCCEEDED/NOT_APPLIED를 반환한 경우에만 저장·삭제 완료 또는 미적용을 표시합니다([Interaction IX-036 · L287–298](./04_INTERACTIONS_AND_COPY.md#514-저장-결과-확인과-안전한-이탈--ix-036)).

## 9. 멱등성·동시성·결과 보존

### 9.1 오퍼레이션별 규칙

| OP | 중복·timeout 처리 | 동시성 기준 |
|---|---|---|
| OP-001 | 재교환은 새 token을 줄 수 있으나 passenger 생성 없음 | 기존 삭제 처리 상태를 mode로 반영 |
| OP-003 | 같은 idempotency key에 같은 passenger 결과 | 익명 주체당 활성 passenger 하나 |
| OP-004 | 같은 key·입력으로 NicknameReceipt 재사용, OP-002는 현재 상태 | fingerprint 우선·expected revision |
| OP-005·010·011 | safe query, 제한된 조회 재시도 가능 | server snapshot/cursor/generation |
| OP-006·012·013 | 같은 key는 같은 ticket | target 예약·revision·generation |
| OP-007 | 같은 ticket은 효과 최대 1회 | prepare snapshot과 execute deadline |
| OP-008 | safe query | 결과 상태는 terminal 뒤 역행 금지 |
| OP-009 | 중복 ack는 204 | outcome tombstone 유지 |
| OP-014 | event ID별 중복 제거 | 기능 상태와 무관 |
| OP-015 | 같은 ticket 종료 재요청은 현재 상태/종료 receipt | 실행 수락과 원자적 봉인 경쟁 |

### 9.2 operation ID와 ticket

- operation ID는 FE가 생성한 무작위 UUID이며 PII나 화면 입력을 encode하지 않습니다.
- 서버는 같은 주체·operation ID의 요청 fingerprint를 비교합니다. fingerprint 원본·본문을 로그에 남기지 않습니다.
- 같은 key·같은 의미면 기존 resource와 결과를 반환하고, 다른 의미면 `IDEMPOTENCY_KEY_REUSED`입니다.
- ticket에는 kind, owner, target, expected revision, data generation, accepted KST date, execute deadline을 고정합니다.
- answer content는 prepare에 저장하지 않고 execute 때 암호화 저장 경계로 전달합니다.

### 9.3 result 수명과 acknowledgement

- 실행 기한과 결과 보존을 분리합니다. executeBy는 PREPARED에서 최초 execution 수락에만 적용합니다. EXECUTING에는 결과 만료를 시작하지 않습니다. 서버는 미결 명령을 운영상 추적·복구하며 장기 실행은 지원 경로로 연결하되 시간만으로 미적용을 만들지 않습니다.
- terminal completedAt에서 정확히 7일 뒤 resultExpiresAt을 확정합니다. 그때까지 최소 proof/오류를 유지하며 ack는 표시 payload만 먼저 제거합니다. 개별 삭제·수정은 관련 과거 presentation을 즉시 제거/무효화합니다. 전체 삭제는 이전 generation의 모든 민감 command payload를 같은 트랜잭션에서 제거합니다.
- 결과 만료 뒤에는 본문·질문·발췌·receipt outcome을 제거하고 최소 봉인 registry(ticket/operation ID·fingerprint·owner/generation·target·acceptedAt/acceptedDateKst/executeBy·추가 실행 불가 상태)만 현 generation 종료까지 유지합니다. 활성 서비스 운영 데이터이며 로그·분석으로 전송하지 않습니다. OP-008은 CLOSED_OUTCOME_UNAVAILABLE, OP-015는 최신 reconciliation을 반환합니다. 같은 operation ID를 새 요청처럼 다시 생성하지 않습니다.
- 전체 삭제 성공은 이전 generation registry도 삭제하며 내용 없는 삭제 receipt·익명 키와의 제한 복구 연결만 completedAt+7일까지 유지합니다. ack 뒤 재탑승하더라도 recentDeletion은 그 기한 내에만 전달합니다. 기한 뒤의 이전 로컬 generation 정리는 OP-001의 PRE 상태 또는 현 ACTIVE 소유 범위 확인으로 수행하고, 과거 데이터 삭제 여부를 새로 추정하지 않습니다.
- 성공/미적용 또는 인증된 종료 reconciliation을 로컬에 반영한 뒤 추적 상태를 제거합니다. 단순 404·timeout·기기 timer만으로 제거하거나 재저장을 허용하지 않습니다. 임시본문은 제품의 마지막 수정 후 7일 정책을 따르며 결과 보존을 이유로 연장하지 않습니다.

### 9.4 generation fence

- 모든 ACTIVE session과 command ticket은 서버 내부 passenger data generation에 묶입니다.
- 전체 삭제 prepare는 OP-004·새 mutation 준비·기존 PREPARED 실행을 막고, 실행 수락은 normal session을 폐기합니다. ACTIVE session 응답의 opaque dataGeneration은 로컬 소유 영역 분리에만 사용하며 FE가 해석하거나 변경 권한으로 제출하지 않습니다.
- 삭제 성공 뒤 과거 generation의 session·ticket·idempotency payload·지연 worker는 읽기·쓰기를 수행할 수 없습니다.
- 같은 익명 키가 이후 다시 들어오면 새 `PRE_PASSENGER`에서 새 passenger를 만들 수 있지만 삭제 전 데이터와 합치지 않습니다.

## 10. 수정·삭제와 데이터 보존 경계

### 10.1 수정과 발췌 갱신

- 수정 성공은 content와 revision을 원자적으로 바꾸고 질문 snapshot·createdAt·createdDateKst는 유지합니다.
- `updatedAt`을 서버 시간으로 바꾸고 `isEdited: true`로 반환합니다.
- 모든 프로필의 발췌는 같은 새 원문에서 다시 생성하고 sourceRevision을 일치시킵니다. 과거 성공 receipt의 presentation은 RESOURCE_CHANGED로 전환하며 옛 질문·발췌를 새 정본처럼 보강하지 않습니다.
- 성공 receipt의 부가 정보가 `UNAVAILABLE`이어도 이후 OP-005·008·010·011은 이전 발췌를 새 정본처럼 반환하면 안 됩니다.
- stale 수정은 `REVISION_CONFLICT`이며 이전 또는 새 content를 부분 적용하지 않습니다.

### 10.2 개별 삭제

- 삭제할 답변의 ID·revision은 prepare에서 고정합니다.
- 같은 ticket의 반복 실행은 같은 `DELETED` 결과입니다.
- 유효 prepare 뒤 같은 revision이 이미 삭제된 경우 `ALREADY_ABSENT`를 성공으로 합류합니다.
- 유효 prepare 뒤 수정된 답변은 삭제하지 않고 `REVISION_CONFLICT`입니다.
- 성공 뒤 detail은 `ANSWER_NOT_FOUND`, 목록·오늘은 해당 답변이 없는 최신 상태를 반환합니다.
- 오늘 답변을 삭제했고 아직 같은 KST 날짜라면 현재 기본·대체 질문 중 하나로 다시 신규 저장할 수 있습니다.

### 10.3 모든 데이터 삭제

| 데이터 | terminal 성공 뒤 처리 |
|---|---|
| 답변 원문·질문 snapshot·발췌 | 활성 저장소에서 제거 |
| passenger profile·nickname·settings | 활성 저장소에서 제거 |
| 현재 session·이전 generation·미완료 command | 폐기·실행 차단 |
| linkable raw analytics | terminal 성공 전 삭제·비가역 unlink 확인 |
| 비식별 일별 aggregate | 개인과 재연결할 수 없는 경우 장기 유지 가능 |
| 동의 증빙 | 별도 저장소에 정책 종류·버전·동의/삭제 시각·가명 주체값만 1년 |
| 백업 | 복구에 사용하지 않고 삭제 요청일부터 최대 30일 안에 만료 |
| 삭제 command receipt | content 없이 `resultExpiresAt`까지 제한 조회 |
| 기기 임시본·캐시·세션 | SUCCEEDED 뒤 이전 generation 영역 제거, 제한 token은 ack 시도 뒤 제거 |

MVP에서는 답변·profile·settings·raw analytics·event dedupe·명령 registry·generation/세션 폐기·삭제 receipt를 하나의 ACID 경계에서 처리합니다. 동의 증빙은 접근권한과 논리 저장소를 분리한 테이블로 같은 commit에 기록합니다. 외부 분석 저장소나 답변 검색 인덱스에 삭제 대상 복제본을 만들지 않습니다. 메모리 cache·queue·worker는 모든 read/write 직전에 generation fence를 확인해 commit 뒤 과거 작업을 차단하고 민감 payload를 지속 보관하지 않습니다. 원자성 경계를 나눌 필요가 생기면 이 계약의 구현 가설 변경으로 숨기지 않고 AR-06 약속을 충족하는 설계·장애 증거를 먼저 채택합니다. DB 제품·테이블 상세는 백엔드가 선택합니다.

`all_data_deleted` 측정은 삭제된 분석 주체를 다시 만들지 않도록 개인 raw event가 아니라 비식별 aggregate 증가로 기록합니다. terminal 실패에는 기존 상태를 유지하며 삭제됐다는 문구나 로컬 clear를 실행하지 않습니다.

## 11. 제품 이벤트 계약

### 11.1 생성 주체

| 이벤트 | 생성 주체 | 발생 기준 |
|---|---|---|
| `onboarding_started` | FE/OP-014 | 최초 F01 표시 |
| `onboarding_skipped` | FE/OP-014 | 건너뛰기 선택 |
| `onboarding_completed` | BE | OP-003 transaction 성공 |
| `today_sema_viewed` | FE/OP-014 | OP-005 성공 결과가 F10에 표시 |
| `alternate_question_viewed` | FE/OP-014 | 해당 SEMA의 대체 질문 첫 표시 |
| `sema_question_changed` | FE/OP-014 | 저장 전 PRIMARY↔ALTERNATE 선택 변경 |
| `answer_started` | FE/OP-014 | 작성 session의 첫 유효 입력 |
| `answer_saved` | BE | 신규 answer command `SUCCEEDED` |
| `answer_save_failed` | FE/OP-014 | 확정 실패 또는 미확인 안내가 사용자에게 표시 |
| `archive_viewed` | FE/OP-014 | OP-010 첫 page가 F20에 표시 |
| `answer_edited` | BE | 수정 answer command `SUCCEEDED` |
| `answer_deleted` | BE | answer delete command `SUCCEEDED` |
| `all_data_deleted` | BE aggregate | 전체 삭제 terminal 성공 뒤 비식별 증가 |

FE는 BE 소유 성공 이벤트를 전송하지 않습니다. 이 경계로 응답 유실·화면 이탈에 따른 성공 이벤트 누락과 중복을 막습니다.

### 11.2 batch DTO와 중복 제거

이벤트별 name·properties 조합은 OpenAPI `ProductEventInput`의 oneOf를 사용합니다. 각 properties와 요청 객체는 닫힌 allowlist이며 임의 Record를 허용하지 않습니다. batch는 1~20개, eventId는 UUID, schemaVersion은 1입니다. transport metadata는 선택적 appVersion·platform뿐입니다.

- 서버는 auth session에서 분석 주체를 파생하며 FE가 익명 키·passenger code·analytics subject를 보내지 않습니다.
- occurredAt은 client 관찰 순서용이고 지표의 수신·귀속 기준은 서버 receivedAt입니다.
- eventId는 raw event 보존 기간 동안 중복 제거하며 전체 삭제 때 주체 연결·dedupe도 함께 제거합니다.
- batch 실패는 화면 행동을 실패시키지 않습니다. queue·flush·best-effort 재전송은 06이 소유합니다.
- 알 수 없는 이벤트 이름·속성은 400으로 batch 전체 거절하며 민감값을 오류에 반사하지 않습니다.

### 11.3 허용 속성

| FE 이벤트 | 허용 properties |
|---|---|
| `onboarding_started` | 없음 |
| `onboarding_skipped` | 없음 |
| `today_sema_viewed` | `answerState: UNANSWERED \| ANSWERED` |
| `alternate_question_viewed` | 없음 |
| `sema_question_changed` | `from: PRIMARY \| ALTERNATE`, `to: PRIMARY \| ALTERNATE` |
| `answer_started` | `mode: CREATE \| UPDATE` |
| `answer_save_failed` | `mode`, `certainty: NOT_APPLIED \| UNKNOWN`, `reasonCode: VALIDATION_REJECTED / DATE_CHANGED / CONTENT_REPLACED / CONFLICT / NETWORK_UNCONFIRMED / SERVER_UNAVAILABLE / PROTOCOL_UNCONFIRMED / COMMAND_CLOSED / COMMAND_EXPIRED` |
| `archive_viewed` | `state: EMPTY \| NON_EMPTY` |

공통 transport metadata로 `appVersion`, `platform: IOS | ANDROID`, event schema version만 허용합니다. 답변 길이·본문·발췌·닉네임·질문 원문·question ID·SEMA ID·익명 키·passenger code·answer ID·ticket ID·오류 stack은 금지합니다.

### 11.4 보존과 삭제

- raw product event는 90일 뒤 삭제합니다.
- 오류 정보는 별도 오류 시스템에서 30일 뒤 삭제합니다.
- 장기 보존은 개인을 구분하거나 원 event로 복원할 수 없는 일별 aggregate만 허용합니다.
- 전체 삭제 terminal 성공 전에 해당 분석 주체와 연결 가능한 raw event의 삭제·unlink를 확인합니다.
- 분석 목적·항목·보존·파기 방법은 실제 개인정보처리방침에 반영되어야 합니다.

## 12. 개인정보·보안·로그 계약

### 12.1 데이터별 허용 경계

| 데이터 | 전송 허용 | 금지 |
|---|---|---|
| 익명 키 원문 | OP-001 HTTPS JSON body, BE→Toss 검증 | URL·header 반복 사용·FE 영속 저장·로그·분석·오류 |
| access token | Authorization header, 실행 중 메모리 | query·로그·분석·영속 cache |
| 답변 원문 | OP-007 write execution, OP-011 detail | 로그·분석·오류·외부 생성 도구·시각 fixture |
| 발췌 | OP-005·007·008·010 response와 화면 | 로그·분석·오류·service worker cache |
| 닉네임 | OP-004 body·receipt, OP-001·002·003 profile response | 로그·분석·오류·외부 오류 추적 |
| 질문 원문/snapshot | OP-005·007·008·010·011 response | 분석 이벤트·오류 payload·운영 로그 |
| operation/request ID | 해당 HTTP 요청·안전한 진단 | 사용자 입력을 encode하거나 access token 대체 |

### 12.2 서버와 FE 공통 의무

- 전송은 HTTPS, 저장 데이터는 at-rest encryption을 적용합니다([Rules DP-01 · L127](../../docs/ARCA_MVP_RULES.md#데이터-보호와-관찰-가능성)).
- reverse proxy, APM, API gateway, Sentry와 애플리케이션 logger에서 민감 header·body·response를 redact합니다.
- 허용 운영 로그는 route template, method, status, latency, 안전한 request ID, 안정 error code처럼 내용 없는 값으로 제한합니다.
- `Cache-Control: no-store`를 모든 인증·session 응답에 적용하고 CDN shared cache를 사용하지 않습니다.
- FE service worker가 `/v1/**`을 cache하지 않습니다. TanStack Query의 메모리 cache와 제거 순서는 `06`에서 정의합니다.
- CORS allowlist, rate limit 수치, WAF·mTLS 인증서 운영은 배포 환경에서 확정하되 본문·키를 탐지 로그에 복사하지 않습니다.
- 운영자가 답변 원문을 일상 열람하는 endpoint·admin UI를 이 계약에 추가하지 않습니다.

## 13. 확인한 자료와 아직 없는 실제 계약

### 13.1 플랫폼 계약의 근거와 한계

아래는 플랫폼 capability의 근거입니다. 실제 SDK export·버전은 [06 §2.3 · L81–95](./06_FRONTEND_SPEC.md#23-공식-플랫폼-사실과-fallback), ARCA 서버·운영 연결값과 완료 조건은 §13.2에서 확인합니다.

- [`getAnonymousKey`와 partner server 검증](https://developers-apps-in-toss.toss.im/user-hash-key/develop.html): 앱별 안정 hash를 받고 partner server가 mTLS로 검증하는 흐름
- [`getServerTime`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC/network.html): Unix millisecond server time capability
- [`Storage`](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EC%A0%80%EC%9E%A5%EC%86%8C/Storage.html): 기기 로컬 key-value capability

공개 공식 문서의 SDK 2.x 표기와 로컬 승인 결정의 SDK 3.x 기준이 일치하지 않습니다. 이 문서는 SDK major에 의존하지 않고 capability 경계를 정의하며, 실제 SDK·WebView 최소 버전과 import 방식은 프로젝트 생성·출시 직전에 공식 콘솔과 문서로 재확인합니다.

공식 문서가 보여 주는 anonymous key 검증은 유효한 앱별 key인지 확인하는 흐름입니다. 요청마다 holder proof·nonce·attestation을 제공한다는 계약은 확인되지 않았으므로, 이 문서는 그 보장을 가정하지 않습니다.

### 13.2 실제 값·구현 확인 필요

| 항목 | 현재 상태 | 완료 조건·영향 |
|---|---|---|
| ARCA API host·환경·CORS origin | 없음 | 실제 배포값과 TLS 확인 전 실서버 통합 차단 |
| OpenAPI·백엔드 route·DTO 구현 | 제안 OpenAPI 작성, 서버 없음 | schema 파생 구현·양방향 contract test 통과 |
| partner app 식별·mTLS 인증서·Toss 검증 설정 | 없음 | OP-001 sandbox/운영 검증 전 로그인 흐름 통합 차단 |
| session TTL·command `executeBy` 운영 수치 | 없음 | response field를 구현하고 07 경계 fixture 확정 |
| 약관·개인정보처리방침 ID·version·실제 URL | 없음 | F02·F30 운영 연결과 법무 승인 전 출시 차단 |
| 고객센터 실제 연결값 | 없음, API 대상 아님 | F30·F90 외부 연결 검증 전 출시 차단 |
| 운영 SEMA 60세트·예비 10세트 | 없음 | OP-005 정본 콘텐츠와 교체 검증 전 출시 차단 |
| analytics 저장소·집계 job·삭제 job | 없음 | DP-06·Acceptance #30·32 검증 전 출시 차단 |
| rate limit·점검 `Retry-After` 수치 | 없음 | 운영 부하·지원 정책에 맞춰 BE 구성, FE는 값 하드코딩 금지 |

자료가 없다는 이유로 `06`의 port, 인메모리 adapter, `07`의 합성 fixture 작성을 막지 않습니다. 실제 도메인·URL·인증서가 있는 것처럼 placeholder를 운영 설정에 넣어서는 안 됩니다.

## 14. 후속 문서 인계

### 14.1 프런트엔드 구현 연결

OP port·wire·오류 정규화는 [06 §3 · L128–207](./06_FRONTEND_SPEC.md#3-최소-구조와-의존-방향), session·generation은 [06 §4 · L209–250](./06_FRONTEND_SPEC.md#4-상태-소유권과-적용-가능성)·[06 §5 · L252–329](./06_FRONTEND_SPEC.md#5-라우팅과-앱-시작), cache는 [06 §6 · L331–386](./06_FRONTEND_SPEC.md#6-query-cache와-목록), 보관·복구·ack·삭제는 [06 §8 · L427–525](./06_FRONTEND_SPEC.md#8-storage-journal과-command-복구)·[06 §9 · L527–576](./06_FRONTEND_SPEC.md#9-세션-닉네임과-삭제), 분석·개인정보는 [06 §10 · L578–642](./06_FRONTEND_SPEC.md#10-플랫폼-ui-분석-오류와-보호)에서 구현합니다.

### 14.2 `07_MOCK_SCENARIOS.md`

해당 slice의 정상·실패·경계 시나리오는 [07 §11 · L179–307](./07_MOCK_SCENARIOS.md#11-이름-있는-시나리오-카탈로그), 고정 고위험 사건 조합은 [07 §12.1 · L311–320](./07_MOCK_SCENARIOS.md#121-base--delta--pairwise)을 사용합니다. API-V-001~027·§16의 불변식은 유지하며 자동 전이 생성·seed·pairwise는 [07 §12.2 · L322–324](./07_MOCK_SCENARIOS.md#122-seeded-state-transition-생성)의 선택 확장입니다. HTTP 상태·OP마다 별도 테스트를 의무화하지 않습니다.

### 14.3 `08_QA_AND_INTEGRATION.md`

API-V·OP의 Mock/실서버 동등성은 [08 §4 · L78–103](./08_QA_AND_INTEGRATION.md#4-계약mock실서버-동등성), 플랫폼은 [08 §7 · L126–138](./08_QA_AND_INTEGRATION.md#7-입력-접근성-플랫폼-검증), 민감정보·보존/삭제는 [08 §9 · L148–177](./08_QA_AND_INTEGRATION.md#9-개인정보-분석-보안과-artifact), 실제 법무·운영 연결과 출시는 [08 §13 · L225–265](./08_QA_AND_INTEGRATION.md#13-결함-flaky-예외와-gate)을 따릅니다. [06 §12 · L666–683](./06_FRONTEND_SPEC.md#12-구현-순서)의 각 slice에서 검증을 누적하고 실서버·출시 증거를 마감합니다.

## 15. 계약 검증 추적

`API-V-*`는 이 문서의 계약 검증 사례 ID입니다. `07`은 합성 fixture로, `08`은 Mock·실서버 동등성 증거로 이어받습니다.

| ID | 검증할 계약 | OP | 근거 |
|---|---|---|---|
| API-V-001 | 유효한 미등록 키는 passenger를 만들지 않고 PRE, 같은 등록 키는 ACTIVE 복원 | OP-001·002 | ON-02·06·08, Acc #2·6 |
| API-V-002 | SDK key 실패에는 요청하지 않으며 지정 session 오류만 1회 복구 | OP-001, 공통 | IX-009·032, Acc #29 |
| API-V-003 | 현재 필수 정책 동의와 passenger가 원자 생성되고 version race는 미생성 | OP-003 | ON-02·03, Acc #3 |
| API-V-004 | 닉네임 2~12 EGC·null 해제·F03 무요청 진행·revision 충돌 | OP-002·004 | ON-05, IX-001~004·035, Acc #4·7 |
| API-V-005 | 같은 날짜 모든 사용자에게 같은 두 질문, 예비 교체와 snapshot 보존 | OP-005·006·011 | SE-02·07~09, Acc #9~13·23 |
| API-V-006 | 답변 1~2,000 EGC, 공백·개행 무trim, passenger·KST 날짜별 배포 단위당 하나 | OP-006~008 | AN-01·03, Acc #13·16 |
| API-V-007 | 23:59 prepare→00:01 execute 성공 가능, 00:01 과거 prepare 거절 | OP-006~008 | SE-01·05, IX-012·034, Acc #18 |
| API-V-008 | 같은 key/ticket 중복은 단일 효과, 다른 payload와 기한 뒤 실행은 미적용 | OP-003·006~009·012·013 | AN-03·09, IX-008·036, Acc #16·39 |
| API-V-009 | timeout·조회 부재는 미적용이 아니며 재진입 뒤 같은 ticket을 확인 | OP-006~009 | AN-09, IX-036, Acc #39 |
| API-V-010 | 저장 성공 proof와 프로필 발췌·활성 수가 독립, 실패가 F12 성공을 취소하지 않음 | OP-005·008 | AN-06·08, IX-021·039, Acc #35 |
| API-V-011 | 수정은 expected revision·질문 snapshot 유지·세 발췌 갱신 | OP-006~008·011 | AN-07, AR-03·09, Acc #19·23·33 |
| API-V-012 | 0/20/21개 bounded cursor, 신규 끼움 없음, 중복 없음, 월 경계 조합 가능 | OP-010 | AR-01·02, IX-023·027, Acc #21·41 |
| API-V-013 | 비소유/없음 은닉, 동시 같은 revision 삭제는 ALREADY_ABSENT, 수정 뒤 삭제는 충돌 | OP-011·012·007 | AR-04, IX-025·029, Acc #22 |
| API-V-014 | 전체 삭제 중 새 mutation 차단, 성공 뒤 이전 session/ticket 부활 없음 | OP-013·007~009·001 | AR-05·06, IX-026·036, Acc #24·39 |
| API-V-015 | terminal 실패에는 활성 데이터 유지, 성공에는 1년 증빙·30일 backup 예외만 적용 | OP-013·007·008 | AR-06~08, Acc #25·32 |
| API-V-016 | 프로필별 EGC·논리적 줄 exact prefix·공백 보존·실제 생략과 수정/삭제 동기화 | OP-005·008·010·011 | AR-09, IX-027·029, Acc #33~35 |
| API-V-017 | 원문·닉네임·키·token이 로그·분석·오류·cache에 없음 | 공통·OP-014 | DP-01~07, Acc #30·32~33 |
| API-V-018 | FE/BE event source 분리, allowlist·중복 제거·90일 raw 삭제·비식별 집계 | OP-014·server events | D-TECH-020, Acc §1·#32 |
| API-V-019 | HTTP 상태와 terminal result 분리, unknown 필드 허용·필수 schema 오류 정규화 | 공통 | D-TECH-012·014, IX-009·036 |
| API-V-020 | prepare 응답 유실·동일 key 복원·PREPARED/EXECUTING 구분·실행/만료/종료 경쟁 | OP-006~009·015 | D-API-031 |
| API-V-021 | 한 기기 ack 뒤 다른 기기의 proof 복구·삭제 ack 응답 유실·recentDeletion과 새 generation 보호 | OP-001·008·009 | D-API-032 |
| API-V-022 | 생성 응답 유실·PRE 폐기·ACTIVE 재교환·같은 생성 key 복구 | OP-001·003 | D-API-033 |
| API-V-023 | nickname 응답 유실·같은 key receipt·동시 수정·7일 뒤 key 봉인 | OP-002·004 | D-API-034 |
| API-V-024 | 예비 콘텐츠 교체 전후 dailySemaId 유지·하루 한 답변·저장 문맥·옛 임시본 정리 | OP-005~008 | OD-19·D-API-035 |
| API-V-025 | receipt 이후 수정/삭제·발췌 sourceRevision·수 observedAt·RESOURCE_CHANGED | OP-005·008·010·011 | D-API-036 |
| API-V-026 | terminal부터 7일 보존·만료 후 봉인/명시적 정리·현재 상태 race·자동 재저장 없음 | OP-008·015 | OD-20·D-API-037 |
| API-V-027 | 삭제 fence와 nickname/예약/worker 경쟁·동의 증빙/analytics/receipt의 commit·rollback 원자성 | OP-004·007·013 | D-API-038 |

### 15.1 구현·통합 게이트

실서버 통합·출시에는 §13.2의 실제 자료·연결 조건과 API-V의 Mock/실서버 동등성, sandbox·실기기 검증 증거가 필요합니다. 계약 문서의 확정은 이를 대체하지 않습니다. 미완료 외부 연결과 독립된 port·인메모리 adapter·합성 fixture 구현은 진행할 수 있습니다.

### 15.2 기계 판독 계약의 재현 검증

기계 판독 원본은 [OpenAPI](./arca.openapi.json), 합성 데이터는 [계약 예시](./contract_examples.json)입니다. 계약 검증 실행기와 고정된 검증 의존성은 현재 제공되지 않았습니다. 프런트엔드 저장소에서 실행기를 마련하고 재현 가능한 환경·설치/실행 명령·결과를 `08_QA_AND_INTEGRATION.md`에 연결합니다.

검증기는 OpenAPI 구조·내부 참조·15개 OP 연결·합성 정상/거절 예시를 확인해야 합니다. 형식 기준은 [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)과 [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation)를 사용합니다. 구조 검증과 별개로 EGC·소유권·commit/rollback·경쟁 실행의 증거를 API-V와 07·08에 연결합니다.

## 16. 저장 요청 분할 비교와 상태 전이 검증

D-API-028은 단일 수락 방식의 비교 권한 승인입니다. 기본 계약은 현재 prepare/execute이며 단일 수락 endpoint를 운영 OpenAPI에 추가하지 않습니다. 비교안은 content·operation ID·대상·revision을 한 번에 영속 수락하고 즉시 terminal 또는 EXECUTING을 반환합니다. 요청 미도착/지연 수락과 종료가 경쟁할 때 원자적으로 ID를 봉인하는 방식까지 포함해야 합니다.

| 비교 항목 | 필요한 증거 |
|---|---|
| 정상 저장 체감 | 같은 합성 본문·기기·왕복 지연에서 저장 클릭→확정 표시 p50/p95와 왕복 수 |
| 날짜·원문 | 첫 영속 수락 날짜·snapshot과 원 payload 고정, 자정/교체에서도 의도하지 않은 변경 없음 |
| 장애·복구 | 송신 전/수락 전/수락 후/commit 후 응답 유실, 앱 종료, 다중 기기, 종료 race, 결과 만료 |
| 복잡도 | FE 복구 상태·필요 영속값·BE 예약/봉인 상태와 운영 복구 부담 비교 |
| 채택 | API-V 불변식 동일 통과, 지연 개선과 복잡도 비용 근거, FE/BE adapter·OpenAPI·담당 명세를 함께 갱신 |

호출 순서·내부 함수 이름 대신 효과 최대 1회·하루 한 활성 응답·원문 보존·terminal 비역행·삭제 후 부활 없음·민감 로그 없음·복구 가능성을 검증합니다. 가상 시간·두 기기의 고정 사건 순서는 [07 §12.1 · L311–320](./07_MOCK_SCENARIOS.md#121-base--delta--pairwise), Mock/실서버 동등성은 [08 §4 · L78–103](./08_QA_AND_INTEGRATION.md#4-계약mock실서버-동등성)를 따릅니다. 자동 전이 생성·seed·최소 실패 순서 축소는 선택 확장이며 도입 시 재현 정보를 남깁니다. schema 검증만으로 동작 검증을 완료하지 않습니다.
