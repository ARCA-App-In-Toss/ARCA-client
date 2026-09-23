#!/usr/bin/env node
import { checkSpecPresence } from './checks/spec-presence.mjs';
import { loadState, validateState, nextAction, repoRoot } from './checks/validate-state.mjs';

try {
  const state = loadState();
  const errors = validateState(state);
  if (errors.length) {
    console.log(`[ARCA] 상태 복구 필요: ${errors.slice(0, 3).join('; ')}. 빌드를 자동 시작하지 마세요.`);
  } else {
    const next = nextAction(state);
    if (next.kind === 'approval') console.log(`[ARCA] ${next.item.id} 사용자 검토 대기. 기존 승인 발언이 있으면 반영하고 중복 질문하지 마세요.`);
    else if (next.kind === 'blocked') console.log(`[ARCA] ${next.item.id} 확인 요청 대기. manual_review의 새 답변·환경 변경 없이 재시도하지 마세요.`);
    else if (next.kind === 'done') console.log('[ARCA] 모든 단계 완료·승인됨.');
    else console.log(`[ARCA] 빌드 요청 시 ${next.item.id} (${next.item.status}) → ${next.item.phase_file}`);
    const missing = checkSpecPresence(repoRoot);
    if (missing.length) console.log(`[ARCA] 로컬 명세 ${missing.length}개 부재. spec-presence로 경로 확인 후 제공 요청; 추측 생성 금지.`);
  }
} catch { console.log('[ARCA] build-state.json 부재/파싱 불가. 상태 복구 전 빌드 금지.'); }
