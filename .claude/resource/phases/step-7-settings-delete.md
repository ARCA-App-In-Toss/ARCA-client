# Step 7 — 설정과 전체 삭제

## 작업 선택

설정/닉네임, 외부 정책 복귀, 전체 삭제 준비, terminal 뒤 generation 정리 중 현재 작업을 고른다. 06 §9 전체를 재독하지 말고 §9.1 또는 §9.3~9.4와 연결된 07 사건만 읽는다. 전체 삭제 공통 불변식은 분리해 생략하지 않는다.

## 참조 지도 — 현재 작업의 절/ID만 선택

- `03_SCREENS_SPEC.md` F30~F31
- `04_INTERACTIONS_AND_COPY.md` 해당 F와 IX-003~004·018·026·029·031·035~036·041
- `05_API_SPEC.md` OP-002·004·007~009·013·015, API-V-014~015·021·023·027
- `06_FRONTEND_SPEC.md` §9, §11 해당 F, §12 단계 7
- `07_MOCK_SCENARIOS.md` MS-ALLDEL-*, 관련 MS-STORAGE-*·MS-CMD-*
- `08_QA_AND_INTEGRATION.md` §6, §9, §13

## 결과

닉네임 편집·정책/지원 복귀와 2단계 전체 삭제가 연결된다. commit 전 local 유지, 성공 뒤 old generation만 정리, A/B tombstone, queue barrier, recentDeletion, 새 탑승 보호, ack/clear 실패를 검증한다. 서버 원자성·retention·backup 증거가 없으면 release PASS가 아니다.
