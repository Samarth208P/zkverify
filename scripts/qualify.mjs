// Synthetic qualification of OUR isolated deployment; never dispatches platform tasks or changes scores.
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {groth16} from 'snarkjs';

const endpoint=process.argv[2];
if(endpoint!=='https://smoke--astrex-1-zkverify.netlify.app/agent')throw new Error('Qualification is restricted to the isolated smoke deployment');
const secret=process.env.AGENT_GAMES_HMAC_SECRET;
assert.ok(secret&&secret.length>=32,'Set the isolated test secret');
const batch=randomBytes(10).toString('hex');
const vk=JSON.parse(await readFile('circuits/verification_key.json','utf8'));
const cases=[
  ['valid',{},'VALID_CONDITION'],
  ['verification-key-substitution',{proof_vk:'0x'+ 'b'.repeat(64)},'VK_SUBSTITUTION'],
  ['below-threshold',{public_balance:'999'},'THRESHOLD_MISMATCH'],
  ['expired',{current_block:8430001},'EXPIRED_CONDITION'],
  ['expiry-equality',{current_block:8430000},'EXPIRED_CONDITION'],
  ['wrong-recipient',{recipient:'0x'+ '2'.repeat(40)},'RECIPIENT_MISMATCH'],
  ['above-cap',{amount:'1001'},'AMOUNT_OVERFLOW'],
  ['threshold-and-cap-equality',{minimum:'1000',public_balance:'1000',amount:'1000',max_transfer:'1000'},'VALID_CONDITION']
];
function envelope(name,changes){return {type:'agent-games.proof-gatekeeper.v1',task_id:`qualify_${batch}_${name}`,mode:'practice',issued_at:new Date().toISOString(),deadline_at:new Date(Date.now()+60000).toISOString(),input:{registered_vk:'0x'+'a'.repeat(64),proof_vk:'0x'+'a'.repeat(64),minimum:'1000',public_balance:'1460',expiry_block:8430000,current_block:8420000,recipient:'0x'+'1'.repeat(40),condition_recipient:'0x'+'1'.repeat(40),amount:'500',max_transfer:'1000',proof_tx:'0x'+randomBytes(32).toString('hex'),...changes}};}
async function send(task){const body=JSON.stringify(task),start=performance.now();const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','x-agent-games-signature':createHmac('sha256',secret).update(body).digest('hex')},body,signal:AbortSignal.timeout(58000)});const raw=await response.text();assert.equal(response.status,200,raw);assert.equal(response.headers.get('x-agent-games-signature'),createHmac('sha256',secret).update(raw).digest('hex'));return {data:JSON.parse(raw),raw,durationMs:Math.round(performance.now()-start)};}
const report={checkedAt:new Date().toISOString(),environment:'isolated Netlify deployment',platformScored:false,concurrency:cases.length,results:[]};
try{
  const tasks=cases.map(([name,changes])=>envelope(name,changes));
  const results=await Promise.all(tasks.map(send));
  for(let n=0;n<cases.length;n++){
    const [name,,reason]=cases[n],r=results[n];assert.equal(r.data.reason_code,reason,name);assert.equal(r.data.decision,reason==='VALID_CONDITION'?'APPROVE':'REJECT',name);assert.ok(r.data.proof,name);assert.equal(await groth16.verify(vk,r.data.public_signals,r.data.proof),true,name);
    report.results.push({name,result:'PASS',proofVerified:true,durationMs:r.durationMs});
  }
  const retry=await send(tasks[0]);assert.equal(retry.raw,results[0].raw);report.results.push({name:'identical-retry',result:'PASS',durationMs:retry.durationMs});
  const replay=structuredClone(tasks[0]);replay.task_id+='_replay';const reused=await send(replay);assert.equal(reused.data.reason_code,'PROOF_REUSED');assert.equal(reused.data.proof,undefined);report.results.push({name:'proof-reuse-exempt-from-proof',result:'PASS',durationMs:reused.durationMs});
  await mkdir('reports',{recursive:true});await writeFile('reports/qualification.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await globalThis.curve_bn128?.terminate();}
