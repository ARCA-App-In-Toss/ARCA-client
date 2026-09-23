---
name: build-orchestrator
description: ARCA 구현을 시작하거나 이어서 진행하라는 요청에 사용한다. 06 §12의 현재 단계를 작은 작업으로 나누어 구현·검증·검토한다. 일반 질문, 명세 편집, 하네스 자체 검토에는 실행하지 않는다.
---

# 빌드 진행

1. 처음 시작하거나 컨텍스트를 복구할 때만 `../../resource/phases/phase-0-recovery.md`를 적용한다. 이미 유효한 상태·현재 작업을 알고 있으면 반복하지 않는다.
2. 현재 단계의 phase 파일에서 **이번에 관찰할 결과 하나**와 해당 ID·검증을 선택한다. checklist 한 항목은 단계이며 여러 작은 slice가 들어갈 수 있다. 남은 범위·다음 행동은 항목의 `work`에 짧게 유지한다.
3. 해당 항목만 IN_PROGRESS로 두고 `implement-one-slice`를 한 번 사용한다. 이미 로드됐으면 절차를 재사용한다. 작업 중에는 변경에 맞는 검증만 수행하고, 승인된 범위의 다음 작은 작업은 진행할 수 있다.
4. 단계의 책임이 모두 구현되어 완료 후보가 되었을 때 `../../rules/hooks.md`에 따라 full 게이트를 실행한다. 8단계는 release다. 하위 스킬·Stop에서 같은 게이트를 중복 실행하지 않는다.
5. `required_reviewers`는 필수 **검토 관점**이다. 작은 변경은 현재 컨텍스트에서 해당 관점을 검토한다. 복구/삭제/공통 경계 변경 등 독립 검토가 필요한 관점만 해당 agent로 실행한다. 모든 단계에서 세 agent를 무조건 실행하지 않는다. 관점→agent는 spec→spec-conformance-reviewer, architecture→architecture-reviewer, experience→experience-reviewer다.
6. 리뷰 입력은 이번 작업의 변경 파일/범위(기존 사용자 변경 제외), 관련 명세 경로·절/ID, 완료 조건, 실행한 검사 결과다. untracked 파일도 명시한다. 저장소 전체 diff·00~08·대화 전문을 넘기지 않는다. 리뷰어는 재설치·재게이트·다른 agent 호출을 하지 않는다. 첫 리뷰와 수정 확인 **최대 2라운드**, 수정 확인은 영향 관점/실패 항목에 한정한다. 부분 결과·도구 한도 종료를 PASS로 바꾸지 않는다.
7. 모든 요구 관점과 게이트가 PASS일 때만 아래 기록을 작성하고 COMPLETED로 바꾼다. 리뷰 후 코드가 바뀌면 영향받는 판정·검증을 다시 확인한다. Mock 단계에서 없는 기기/서버 증거는 external_evidence에 BLOCKED/NOT_RUN으로 남겨 08에 연결한다. 8단계는 08 release 필수 증거가 모두 PASS여야 완료다.
8. `build-review-packet`을 한 번 제출한다. 다음 단계에 대한 기존 승인/연속 진행 위임이 있으면 근거를 approvals에 기록하고 진행한다. 없으면 완성된 결과를 사용자에게 보여주고 검토를 기다린다.

## 실패와 중단

- 명세 모순·정책 판단·credential/host·미제공 기기/서버·권한은 사용자 답이 필요하다. 같은 검사 재실행이나 의존성 재설치로 해결하려 하지 않는다. 영향·추천안·필요한 답 하나를 제시한다.
- 코드 원인이 확인되고 수정 근거가 있을 때만 작업 단위당 최대 2회 재수정한다. 실패한 재수정 횟수는 rules/hooks.md의 retry에 기록한다. 게이트와 리뷰 실패가 같은 예산을 공유한다. 새 근거가 없으면 한도 전에도 중단한다.
- 영향받지 않는 **현재 단계 안의** 독립 작업은 계속할 수 있다. 필요한 답을 기다릴 때는 manual-review로 기록한다. 미확인 구현을 완료 처리하거나 다음 단계를 조용히 시작하지 않는다.
- 커밋/원격 작업은 현재 사용자 요청·저장소 정책을 따른다. 빌드 시작이 push·merge·배포·실데이터 삭제 권한을 뜻하지 않는다.

## 단계 리뷰 기록

`.claude/reviews/<id>.json`에 다음 구조를 사용한다. 실제로 실행한 것만 기록하고 원본 로그는 복사하지 않는다.

```json
{
  "id": "step-N-name",
  "reviewers": { "spec": "PASS", "architecture": "PASS", "experience": "PASS" },
  "methods": { "spec": "local", "architecture": "agent", "experience": "local" },
  "files": ["변경된 파일 경로"],
  "gate": { "mode": "--full", "result": "PASS" },
  "external_evidence": [{ "status": "NOT_RUN", "ref": "08의 해당 증거 위치" }],
  "commit": null,
  "ts": "ISO-8601"
}
```

reviewers/methods는 해당 required_reviewers만 기록한다. commit이 null이면 패킷에 dirty 상태를 적는다. 실제 환경 부재를 코드 결함으로 재수정하지 않는다.
