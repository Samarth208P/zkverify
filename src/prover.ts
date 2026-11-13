import {createHash,createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {groth16} from 'snarkjs';
import {FIELD,hex,uint,type Task,type Decision} from './policy.js';

const circuitPath = (name: string) => path.join(process.cwd(),'circuits',name);
export function taskField(taskId: string): string {
  if (/^0x[0-9a-f]+$/i.test(taskId)) return (BigInt(taskId)%FIELD).toString();
  return (BigInt('0x'+createHash('sha256').update(taskId).digest('hex'))%FIELD).toString();
}
export function witness(task: Task, decision: Decision, saltKey: string) {
  const i=task.input;
  const field=(s:string)=>(BigInt(hex(s))%FIELD).toString();
  return {
    registeredVkHash:field(i.registered_vk),proofVkHash:field(i.proof_vk),
    minimum:uint(i.minimum).toString(),publicBalance:uint(i.public_balance).toString(),
    expiryBlock:uint(i.expiry_block).toString(),currentBlock:uint(i.current_block).toString(),
    recipient:field(i.recipient),conditionRecipient:field(i.condition_recipient),
    amount:uint(i.amount).toString(),maxTransfer:uint(i.max_transfer).toString(),
    decision:decision.decision==='APPROVE'?'1':'0',taskId:taskField(task.task_id),
    salt:(BigInt('0x'+createHmac('sha256',saltKey).update(`astrex-proof-salt-v1:${task.mode}:${task.task_id}`).digest('hex'))%FIELD).toString()
  };
}
export async function prove(task: Task, decision: Decision, saltKey: string) {
  // snarkjs's runtime supports these extra options; current community types omit them.
  const fullProve = groth16.fullProve as (...args: unknown[]) => Promise<{proof: object;publicSignals: string[]}>;
  const result = await fullProve(witness(task,decision,saltKey),circuitPath('gatekeeper.wasm'),circuitPath('gatekeeper_final.zkey'),undefined,{memorySize:256},{singleThread:true});
  return {proof:result.proof, public_signals:result.publicSignals};
}
export async function artifactsAvailable() {
  await Promise.all(['gatekeeper.wasm','gatekeeper_final.zkey','verification_key.json'].map(name=>readFile(circuitPath(name))));
}
