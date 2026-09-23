# Step 5 — 복구 확장

## 작업 선택

F13/명시적 close, session 갱신, 날짜/SEMA 전환, 만료/restart 중 한 사건을 고른다. 07의 모든 TIME·SEMA·DRAFT·RESULT·CMD family를 읽지 말고 현재 사건 ID와 선행 불변식만 추적한다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `03_SCREENS_SPEC.md` F13과 F10/F11 복구 상태
- `04_INTERACTIONS_AND_COPY.md` IX-022·027~028·034·036·040~041
- `05_API_SPEC.md` OP-008~009·015, 결과 수명·ack/close
- `06_FRONTEND_SPEC.md` §5.4~§5.6, §7~§8, §11 F13, §12 단계 5
- `07_MOCK_SCENARIOS.md` MS-TIME-*, MS-SEMA-*, MS-DRAFT-*, MS-RESULT-*, MS-CMD-*
- `08_QA_AND_INTEGRATION.md` §3, §6

## 결과

PREPARED/EXECUTING/late terminal/명시적 close, 날짜·SEMA 변경, 7일 만료, F13 copy fallback, restart/foreground 복구가 연결된다. 단일 수락 비교는 별도 요청이 있을 때만 05 §16을 읽고 운영 계약을 자동 대체하지 않는다.
