# Step 6 — 기록 관리

## 작업 선택

목록/pagination → 상세/복원 → 수정 → 삭제 중 현재 작업을 고른다. 이미 구현한 F20/F21은 변경 범위만 확인하며 OP·07 family도 이 작업에서 호출하는 항목만 연다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `03_SCREENS_SPEC.md` F20~F23
- `04_INTERACTIONS_AND_COPY.md` 해당 F와 IX-023~025·027·029·036~042
- `05_API_SPEC.md` OP-006~012, API-V-011~013·016·020·025~026
- `06_FRONTEND_SPEC.md` §6, §8, §9.2, §11 해당 F, §12 단계 6
- `07_MOCK_SCENARIOS.md` MS-LIST-*, MS-NAV-*, MS-EDIT-*, MS-DELETE-*, 관련 MS-CMD-*
- `08_QA_AND_INTEGRATION.md` §3, §8

## 결과

0/20/21개·월 경계·cursor·명시적 갱신·깊은 scroll 복원, F21 읽기, F22 exact 수정/충돌, F23 확인/terminal 삭제가 동작한다. 목록/count 독립 실패, 후보 무효화, focus/Back/Overlay를 검증한다.
