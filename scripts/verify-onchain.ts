import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,randomBytes} from 'node:crypto';
import {groth16} from 'snarkjs';
import {prove} from '../src/prover.js';
import {evaluate,type Task} from '../src/policy.js';
import {submitAndFinalize,KurierError} from '../src/kurier.js';

// Synthetic testnet submission only; this never dispatches or answers a competition task.
async function main() {
  const apiKey=process.env.KURIER_API_KEY;
  if (!apiKey?.trim()) throw new KurierError('KURIER_KEY_REQUIRED: save your TESTNET key in .env');
  const now=Date.now();
  const task:Task={type:'agent-games.proof-gatekeeper.v1',task_id:`kurier_test_${randomUUID()}`,mode:'practice',
    issued_at:new Date(now).toISOString(),deadline_at:new Date(now+60000).toISOString(),
    input:{registered_vk:'0x01',proof_vk:'0x01',minimum:'1000',public_balance:'1460',
      expiry_block:8430000,current_block:8420000,recipient:'0x2a',condition_recipient:'0x2a',
      amount:'500',max_transfer:'1000',proof_tx:'0x'+randomBytes(32).toString('hex')}};
  const vk=JSON.parse(await readFile('circuits/verification_key.json','utf8'));
  const proof=await prove(task,evaluate(task.input),randomBytes(32).toString('hex'));
  if (!await groth16.verify(vk,proof.public_signals,proof.proof as Parameters<typeof groth16.verify>[2])) throw new Error('LOCAL_PROOF_INVALID');
  console.log('Official-circuit proof verified locally. Submitting to Kurier TESTNET.');
  // The published registered VK hash is MAINNET; send the full VK on testnet.
  const result=await submitAndFinalize(proof,vk,{apiKey,network:'testnet',timeoutMs:120000});
  await mkdir('reports',{recursive:true});
  await writeFile('reports/kurier-testnet.json',JSON.stringify({checkedAt:new Date().toISOString(),platformScored:false,...result},null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
try {await main();} catch(error) {
  console.error(error instanceof KurierError ? error.code : 'TESTNET_VERIFICATION_FAILED');
  process.exitCode=1;
} finally {
  await (globalThis as typeof globalThis & {curve_bn128?:{terminate:()=>Promise<void>}}).curve_bn128?.terminate();
}
