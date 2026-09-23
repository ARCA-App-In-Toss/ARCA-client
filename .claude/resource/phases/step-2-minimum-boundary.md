# Step 2 — 최소 경계

## 작업 선택

ports/composition → F00/F90 bootstrap → session/generation → 최소 journal/routes 중 현재 작업을 고른다. 최초 구조는 06 §3.1~3.3, 상태는 §4, bootstrap은 §5.3, journal은 §8.1~8.2만 연결한다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `03_SCREENS_SPEC.md` F00, F90
- `04_INTERACTIONS_AND_COPY.md`의 같은 F와 IX-009·031·032·036
- `05_API_SPEC.md` OP-001, 오류·결과 확실성
- `06_FRONTEND_SPEC.md` §3~§5, §8.1~§8.2, §11의 F00/F90, §12 단계 2
- `07_MOCK_SCENARIOS.md` MS-SES-001~004, MS-STORAGE 관련 현재 범위
- `08_QA_AND_INTEGRATION.md` §3, §6~§7

## 결과

ports, composition root, F00/F90, PRE/ACTIVE/error Mock, session epoch/data generation, 최소 journal, routes/Back이 연결된다. 실제 익명 키·Storage가 없으면 adapter 증거만 BLOCKED로 남긴다. random ID/localStorage fallback은 없다.
