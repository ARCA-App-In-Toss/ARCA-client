# ARCA 프런트엔드

ARCA 서비스 구현을 위한 하네스와 개발 명세입니다.

## 시작

1. 이 폴더를 Claude Code로 엽니다.
2. “빌드 시작”이라고 요청하면 하네스가 현재 단계부터 진행합니다.
3. 명세는 [00_INDEX](spec/00_INDEX.md), 사용법은 [HARNESS](resource/HARNESS.md), 진행 상태는 [build-state.json](build-state.json)에서 확인합니다.

현재는 명세와 하네스 인계 상태이며 앱 source·package·lockfile은 아직 없습니다. 첫 단계에서 실제 템플릿과 도구를 확인합니다.

## 문서 지도

- [개발 명세와 관할](spec/00_INDEX.md): 00~08, API 계약, 구현·검증 기준
- [플랫폼 기준](../spec/platform/ARCA_APPS_IN_TOSS_FEATURES.md): 앱인토스 플랫폼 참조
- [제품 요구사항](../docs/ARCA_MVP_PRD.md): 목적·대상·MVP 범위
- [도메인 및 운영 규칙](../docs/ARCA_MVP_RULES.md): 제품 정책과 불변식
- [사용자 흐름](../docs/ARCA_USER_FLOW.md): 화면과 전이
- [검증 및 출시 기준](../docs/ARCA_MVP_ACCEPTANCE.md): 제품 합격 조건
- [열린 결정](../docs/ARCA_OPEN_DECISIONS.md): 제품 결정 상태
- [인트로 서사](../docs/ARCA_INTRO_STORY.txt): 서사 원문
- [에셋 매니페스트](../design/assets/ASSET_MANIFEST.md): 디자인 자료의 출처·권리·상태

`.claude/`와 `spec/`은 기존 `arca` 폴더에서 이동했으며, 프런트엔드 명세는 `.claude/spec/`, 플랫폼 기준은 `spec/platform/`에 있습니다. 명세가 참조하는 `docs/`와 `design/`은 인계 시점의 자료를 복사했으며 원본은 기존 폴더에 남아 있습니다. 이 작업에서는 저장소 초기화·앱 생성·의존성 설치를 수행하지 않았습니다.

## 하네스 확인

```bash
bash .claude/hooks/checks/gate-runner.sh
node --test .claude/hooks/checks/harness.test.mjs
```

앱 생성 전 fast 게이트는 상태·명세 존재만 확인합니다. 앱 build나 출시 검증을 통과했다는 의미가 아닙니다.
