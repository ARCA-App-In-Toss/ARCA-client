---
paths:
  - "src/ui/**/*"
  - "src/screens/**/*"
  - "src/scenes/**/*"
  - "src/app/**/*"
  - ".claude/spec/0[1-4]_*.md"
---
# 규칙 — UI·문구·접근성

권위는 01의 경험 방향, 02의 토큰/CMP, 03의 화면 결과, 04의 IX/CPY다.

- 좌표·장면 수·컴포넌트 나열 순서를 유일한 정답으로 고정하지 않는다. 필수 정보·전이·보호·접근성과 화면별 “검증할 결과”를 우선한다.
- 색·간격·서체·형태·모션은 ARCA 의미 기반 토큰만 사용한다. 외부 UI는 `ui/`의 ARCA wrapper 안에서만 사용한다.
- CMP-009~012는 실제 native control, label, ref, composition, selection을 보존한다. UTF-16 `length`, `maxLength`, 자동 trim/절단으로 EGC 계약을 대체하지 않는다.
- F10→F11→F12는 같은 질문 identity와 실제 텍스트/입력 DOM을 유지한다. 장식·모션·폰트 지연이 입력·결과·이동을 막지 않는다.
- 저장 control은 inline/bar 전환에도 같은 DOM과 focus를 유지한다. 320px, 200%, 키보드, Safe Area, Reduced Motion을 함께 검증한다.
- 문구는 04 §7.0의 필수 의미·표시 조건·현재 채택 문자열을 구분한다. 의미를 보존한 허용 조정은 문자 일치만으로 실패시키지 않는다.
- live region, Toast, field 오류를 중복 발표하지 않는다. Overlay는 focus·Back·dismiss 잠금·복귀 계약을 지킨다.
- 외부 UI/에셋 채택 시 출처·버전/commit·로컬 경로·수정·검증을 06 §2.4와 Asset Manifest의 기존 담당 위치에 기록한다.
