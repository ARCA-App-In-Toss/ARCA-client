#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const statuses = new Set(['TODO', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'manual-review']);
const reviewers = new Set(['spec', 'architecture', 'experience']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const safeId = (value) => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
};

export function loadState(root = repoRoot) {
  return JSON.parse(readFileSync(resolve(root, '.claude/build-state.json'), 'utf8'));
}

// A completed final step still needs approval; a blocked step must never be skipped.
export function nextAction(state) {
  for (const item of state.checklist) {
    if (item.status === 'COMPLETED' && !state.approvals[item.id]) return { kind: 'approval', item };
    if (item.status === 'manual-review') return { kind: 'blocked', item };
    if (item.status === 'TODO' || item.status === 'IN_PROGRESS') return { kind: 'work', item };
  }
  return { kind: 'done' };
}

export function validateState(state, root = repoRoot) {
  const errors = [];
  if (!object(state)) return ['상태는 JSON object여야 함'];
  if (state.meta?.phase !== 'BUILD') errors.push('meta.phase는 BUILD여야 함');
  for (const key of ['retry', 'approvals']) if (!object(state[key])) errors.push(`${key}: object 필요`);
  for (const key of ['manual_review', 'log']) if (!Array.isArray(state[key])) errors.push(`${key}: 배열 필요`);
  if (!Array.isArray(state.checklist) || !state.checklist.length) return [...errors, 'checklist가 비어 있거나 배열이 아님'];
  if (errors.length) return errors;

  const ids = new Set();
  let unfinished = false;
  let unapproved = false;
  let active = 0;
  for (const item of state.checklist) {
    if (!object(item) || !safeId(item.id)) { errors.push('유효한 id 없는 checklist 항목'); continue; }
    const id = item.id;
    if (ids.has(id)) errors.push(`${id}: 중복 id`);
    ids.add(id);
    if (!statuses.has(item.status)) errors.push(`${id}: 허용되지 않은 status`);
    const path = text(item.phase_file) ? resolve(root, item.phase_file) : '';
    if (!path || !inside(resolve(root, '.claude/resource/phases'), path) || !existsSync(path)) errors.push(`${id}: 유효한 phase_file 부재`);
    if (!Array.isArray(item.required_reviewers) || item.required_reviewers.some((name) => !reviewers.has(name))) errors.push(`${id}: required_reviewers 오류`);
    if (!Array.isArray(item.scope)) errors.push(`${id}: scope 배열 필요`);

    const started = item.status !== 'TODO';
    if (unfinished && started) errors.push(`${id}: 앞선 미완료 항목을 건너뜀`);
    if (unapproved && started) errors.push(`${id}: 앞선 사용자 승인 없이 시작됨`);
    if (item.status === 'IN_PROGRESS') active++;
    if (!['COMPLETED', 'SKIPPED'].includes(item.status)) unfinished = true;
    if (item.status === 'COMPLETED' && !state.approvals[id]) unapproved = true;
    if (item.status === 'SKIPPED' && (!text(item.skip_reason) || !state.approvals[id])) errors.push(`${id}: SKIPPED 사유·사용자 승인 필요`);

    const retry = state.retry[id];
    if (retry !== undefined && (!object(retry) || !Number.isInteger(retry.attempts) || retry.attempts < 0 || !text(retry.reason))) errors.push(`${id}: retry는 attempts·reason 필요`);
    if (retry?.attempts >= 2 && item.status === 'IN_PROGRESS' && !state.manual_review.some((entry) => entry?.id === id)) errors.push(`${id}: 재수정 한도 소진, manual_review 기록 필요`);
    if (item.status === 'manual-review' && !state.manual_review.some((entry) => entry?.id === id)) errors.push(`${id}: manual_review 원인 기록 필요`);

    if (item.status !== 'COMPLETED') continue;
    try {
      const review = JSON.parse(readFileSync(resolve(root, '.claude/reviews', `${id}.json`), 'utf8'));
      if (review.id !== id) errors.push(`${id}: 리뷰 id 불일치`);
      for (const name of item.required_reviewers ?? []) if (review.reviewers?.[name] !== 'PASS') errors.push(`${id}: ${name} 리뷰 PASS 아님`);
      const mode = id === 'step-8-integration' ? '--release' : '--full';
      if (review.gate?.mode !== mode || review.gate?.result !== 'PASS') errors.push(`${id}: ${mode} PASS 기록 필요`);
      if (!Array.isArray(review.files) || !review.files.length || !text(review.ts)) errors.push(`${id}: 검토 파일·시각 필요`);
      if (!Array.isArray(review.external_evidence)) errors.push(`${id}: external_evidence 배열 필요`);
      else if (id === 'step-8-integration' && (!review.external_evidence.length || review.external_evidence.some((entry) => entry.status !== 'PASS' || !text(entry.ref)))) errors.push(`${id}: 실제 환경 PASS 증거 필요`);
    } catch { errors.push(`${id}: 리뷰 JSON 부재 또는 파싱 불가`); }
  }
  if (active > 1) errors.push(`IN_PROGRESS가 ${active}개`);
  for (const [id, approval] of Object.entries(state.approvals)) {
    if (!ids.has(id) || !object(approval) || !text(approval.ts) || !text(approval.evidence)) errors.push(`${id}: 승인 시각·사용자 발언 근거 필요`);
  }
  for (const entry of state.manual_review) {
    if (!object(entry) || !ids.has(entry.id) || !text(entry.reason) || !text(entry.next_action)) errors.push('manual_review: id·reason·next_action 필요');
    else if (state.checklist.find((item) => item?.id === entry.id)?.status !== 'manual-review') errors.push(`${entry.id}: 미해결 요청은 manual-review 상태여야 함`);
  }
  return errors;
}

if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const errors = validateState(loadState());
    console.log(errors.length ? `validate-state FAIL\n${errors.slice(0, 10).map((e) => `- ${e}`).join('\n')}` : 'validate-state OK');
    process.exitCode = errors.length ? 1 : 0;
  } catch { console.error('build-state.json 부재 또는 파싱 불가'); process.exitCode = 1; }
}
