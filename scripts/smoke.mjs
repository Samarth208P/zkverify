import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {groth16} from 'snarkjs';

const endpoint=process.argv[2];
if(!endpoint||!/^https:\/\/[a-z0-9-]+\.netlify\.app\/agent$/.test(endpoint))throw new Error('Supply the deployed Netlify /agent URL');
const secret=process.env.AGENT_GAMES_HMAC_SECRET;
if(!secret||secret.length<32)throw new Error('HMAC secret missing from environment');
async function send(data) {
  const body=JSON.stringify(data);
  const started=Date.now();
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-agent-games-signature':createHmac('sha256',secret).update(body).digest('hex')},body,signal:AbortSignal.timeout(58000)});
  const raw=await response.text();
  assert.equal(response.status,200,`HTTP ${response.status}: ${raw.slice(0,200)}`);
  assert.equal(response.headers.get('x-agent-games-signature'),createHmac('sha256',secret).update(raw).digest('hex'),'Response HMAC mismatch');
  return {data:JSON.parse(raw),raw,ms:Date.now()-started};
}
try {
  const health=await fetch(endpoint);assert.equal(health.status,200);console.log('PASS public health endpoint');
  const unauthorized=await fetch(endpoint,{method:'POST',body:'{}'});assert.equal(unauthorized.status,401);console.log('PASS unauthorized request rejected');
  const preflight=await send({type:'agent-games.preflight.v1',agent_id:'agt_local_smoke',issued_at:new Date().toISOString(),nonce:randomBytes(16).toString('hex')});
  assert.deepEqual(preflight.data,{ok:true,protocolVersion:'v1'});console.log('PASS synthetic signed preflight and response HMAC');
  const id='smoke_'+randomBytes(12).toString('hex');
  const task={type:'agent-games.proof-gatekeeper.v1',task_id:id,mode:'practice',issued_at:new Date().toISOString(),deadline_at:new Date(Date.now()+60000).toISOString(),input:{registered_vk:'0x01',proof_vk:'0x01',minimum:'1000',public_balance:'1460',expiry_block:8430000,current_block:8420000,recipient:'0x2a',condition_recipient:'0x2a',amount:'500',max_transfer:'1000',proof_tx:'0x'+randomBytes(32).toString('hex')}};
  const result=await send(task);assert.equal(result.data.decision,'APPROVE');assert.ok(result.data.proof,'Proof absent');
  const vk=JSON.parse(await readFile('circuits/verification_key.json','utf8'));
  assert.equal(await groth16.verify(vk,result.data.public_signals,result.data.proof),true);console.log(`PASS deployed proof generation and local cryptographic verification (${result.ms}ms)`);
  assert.equal((await send(task)).raw,result.raw);console.log('PASS persistent retry returns identical response');
  task.task_id=id+'_replay';const reused=await send(task);assert.equal(reused.data.reason_code,'PROOF_REUSED');console.log('PASS persistent cross-task replay rejection');
  console.log('Synthetic smoke tests passed. Platform preflight/practice acceptance is still required.');
} finally {await globalThis.curve_bn128?.terminate();}
