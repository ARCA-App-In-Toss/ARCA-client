# Step 3 — 핵심 경험

## 작업 선택

최소 F10→F11→F12→F20/F21 연결을 먼저 만들고 보관·응답 유실·장면/입력 검증을 작은 작업으로 확장한다. 해당 F 한 묶음과 07 MS-CORE의 현재 사건을 먼저 고른다. 06의 목록(§6), 입력(§7), journal(§8), 플랫폼 UI(§10)는 작업에 필요한 하위 절만 연다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `03_SCREENS_SPEC.md` F10, F11, F12, F20, F21
- `04_INTERACTIONS_AND_COPY.md` 해당 F와 IX-005~012·019~021·023~024·027·029·033·036~042
- `05_API_SPEC.md` OP-005~011과 API-V-005~010·012·016·020·024~026
- `06_FRONTEND_SPEC.md` §6~§8, §10, §11 해당 F, §12 단계 3
- `07_MOCK_SCENARIOS.md` MS-CORE-001~010
- `08_QA_AND_INTEGRATION.md` §3의 CORE 행, §7·§9~§10

## 결과

개발용 ACTIVE 승객으로 F10→F11→F12→F20→F21이 실제 UI에서 이어진다. exact draft read-back, terminal 확인 뒤 저장, 같은 문장 다시 읽기, 응답 유실·조기 이탈·마무리 중 종료를 검증한다. 운영 build에는 ACTIVE 우회가 없다. 공통 장면·선별 CMP는 320px/200%/IME/Safe Area/Reduced Motion/자원 실패에서도 조작을 보존한다.
