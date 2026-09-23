# Step 4 — 탑승 연결

## 작업 선택

인트로/동의 → 승객 생성 → 선택 닉네임/ACTIVE handoff 순으로 현재 작업을 고른다. 07은 ONB·NICK 중 해당 행, SES는 연결한 인증/전이 사건만 읽는다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `03_SCREENS_SPEC.md` F01~F03
- `04_INTERACTIONS_AND_COPY.md` 해당 F와 IX-001~004·020·031~032·035
- `05_API_SPEC.md` OP-001~004, API-V-001~004·022~023
- `06_FRONTEND_SPEC.md` §5, §9.1, §11 해당 F, §12 단계 4
- `07_MOCK_SCENARIOS.md` MS-ONB-*, MS-NICK-*, 관련 MS-SES-*
- `08_QA_AND_INTEGRATION.md` §3, §7

## 결과

인트로·동의·승객 생성·선택 닉네임·ACTIVE handoff가 연결된다. 동의 원자성, 생성/닉네임 응답 유실, 빈 닉네임 무요청 진행, 외부 정책 복귀 focus, EGC/IME를 검증한다. 실제 정책 URL/partner 설정 부재는 출시 blocker로 남긴다.
