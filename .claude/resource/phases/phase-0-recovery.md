# 실행 상태 복구

1. `node .claude/hooks/checks/validate-state.mjs`로 상태를 확인한다. 실패하면 해당 원인만 확인하고 추측으로 COMPLETED/SKIPPED/승인을 만들지 않는다.
2. build-state의 checklist를 앞에서부터 확인한다. 첫 미승인 COMPLETED는 검토 대기, manual-review는 답/환경 변경 대기, TODO/IN_PROGRESS는 작업 대상이다. 마지막 단계 승인도 같은 규칙을 쓴다.
3. 기존 사용자 발언에 승인·연속 진행 위임이 있으면 근거와 함께 반영한다. 이미 해결된 요청은 기록을 정정하고, 답이 없는 차단은 재시도하지 않는다.
4. 작업 대상의 `work` 포인터·phase 파일만 복구한다. 같은 세션의 유효한 읽기/검증은 반복하지 않는다.
5. 의존성 부재 시에만 packageManager와 lockfile을 확인해 고정 설치를 한 번 시도한다. 인증·네트워크·버전 충돌은 원인을 보고하며 다른 매니저·lockfile 재생성으로 반복 시도하지 않는다.

필요한 경우 재개 ID와 다음 행동 한 줄만 출력한다. 상태 파일의 log 전문을 대화에 복사하지 않는다.
