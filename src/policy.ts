export const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export type Decision = { decision: 'APPROVE' | 'REJECT'; reason_code: string };
export type Input = {
  registered_vk: string; proof_vk: string; minimum: string; public_balance: string;
  expiry_block: string | number; current_block: string | number; recipient: string;
  condition_recipient: string; amount: string; max_transfer: string; proof_tx: string;
};
export type Task = {
  type: 'agent-games.proof-gatekeeper.v1'; task_id: string;
  mode: 'practice' | 'competition'; issued_at: string; deadline_at: string; input: Input;
};
export function uint(value: unknown): bigint {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) throw new Error('INVALID_INTEGER');
  if (!['string', 'number'].includes(typeof value) || !/^(0|[1-9][0-9]*)$/.test(String(value))) throw new Error('INVALID_INTEGER');
  const n = BigInt(String(value));
  if (n > (1n << 64n) - 1n) throw new Error('INTEGER_OUT_OF_RANGE');
  return n;
}
export function hex(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(value)) throw new Error('INVALID_HEX');
  return '0x' + BigInt(value).toString(16);
}
export function parseTask(value: unknown): Task {
  if (!value || typeof value !== 'object') throw new Error('INVALID_TASK');
  const t = value as Task;
  if (t.type !== 'agent-games.proof-gatekeeper.v1' || typeof t.task_id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(t.task_id)) throw new Error('INVALID_TASK');
  if (!['practice', 'competition'].includes(t.mode)) throw new Error('INVALID_MODE');
  if (!t.input || typeof t.input !== 'object') throw new Error('INVALID_INPUT');
  for (const key of ['minimum','public_balance','expiry_block','current_block','amount','max_transfer'] as const) uint(t.input[key]);
  for (const key of ['registered_vk','proof_vk','recipient','condition_recipient','proof_tx'] as const) hex(t.input[key]);
  return t;
}
export function evaluate(input: Input): Decision {
  if (hex(input.registered_vk) !== hex(input.proof_vk)) return {decision:'REJECT',reason_code:'VK_SUBSTITUTION'};
  if (uint(input.public_balance) < uint(input.minimum)) return {decision:'REJECT',reason_code:'THRESHOLD_MISMATCH'};
  // The supplied circuit requires expiryBlock > currentBlock, including the equality boundary.
  if (uint(input.current_block) >= uint(input.expiry_block)) return {decision:'REJECT',reason_code:'EXPIRED_CONDITION'};
  if (hex(input.recipient) !== hex(input.condition_recipient)) return {decision:'REJECT',reason_code:'RECIPIENT_MISMATCH'};
  if (uint(input.amount) > uint(input.max_transfer)) return {decision:'REJECT',reason_code:'AMOUNT_OVERFLOW'};
  return {decision:'APPROVE',reason_code:'VALID_CONDITION'};
}
