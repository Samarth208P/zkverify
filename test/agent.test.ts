import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {groth16} from 'snarkjs';
import {createAgent} from '../src/agent.js';
import {MemoryStore} from '../src/store.js';
import {evaluate,type Task} from '../src/policy.js';
import {prove} from '../src/prover.js';

const secret='a'.repeat(64);
const time=Date.parse('2026-11-13T17:00:00Z');
// snarkjs verification caches a worker pool; release it so the test runner exits normally.
after(async()=>{await (globalThis as typeof globalThis & {curve_bn128?:{terminate:()=>Promise<void>}}).curve_bn128?.terminate();});
function task(id='gk_test'):Task{return {
  type:'agent-games.proof-gatekeeper.v1',task_id:id,mode:'practice',issued_at:new Date(time).toISOString(),deadline_at:new Date(time+60000).toISOString(),
  input:{registered_vk:'0x01',proof_vk:'0x01',minimum:'1000',public_balance:'1460',expiry_block:8430000,current_block:8420000,recipient:'0x2a',condition_recipient:'0x2a',amount:'500',max_transfer:'1000',proof_tx:'0xabc'}
};}
function request(data:unknown,key:Buffer|string=secret,prefix=''){
  const body=JSON.stringify(data);return new Request('https://example.com/agent',{method:'POST',headers:{'content-type':'application/json','x-agent-games-signature':prefix+createHmac('sha256',key).update(body).digest('hex')},body});
}
function mockAgent(store=new MemoryStore()) {return createAgent({secret,store,now:()=>time,checkArtifacts:async()=>{},prover:async()=>({proof:{testOnly:true},public_signals:['1']})});}

test('authentication happens before parsing and unsigned requests fail',async()=>{
  const response=await mockAgent()(new Request('https://example.com/agent',{method:'POST',body:'{broken json'}));assert.equal(response.status,401);
});
test('preflight responds with verified raw-body signature for both secret encodings',async()=>{
  for(const [key,prefix] of [[secret,''],[Buffer.from(secret,'hex'),'sha256=']] as const){
    const response=await mockAgent()(request({type:'agent-games.preflight.v1',agent_id:'agt_test',nonce:'n1',issued_at:new Date(time).toISOString()},key,prefix));
    assert.equal(response.status,200);const body=await response.text();assert.deepEqual(JSON.parse(body),{ok:true,protocolVersion:'v1'});
    assert.equal(response.headers.get('x-agent-games-signature'),prefix+createHmac('sha256',key).update(body).digest('hex'));
  }
});
test('expired task cannot be processed',async()=>{const t=task();t.deadline_at=new Date(time-1).toISOString();assert.equal((await mockAgent()(request(t))).status,400);});
test('malformed, unsafe and negative integers fail schema validation',async()=>{
  for(const value of ['-1','1.5','1e3','18446744073709551616',Number.MAX_SAFE_INTEGER+1]){
    const t=task();t.input.amount=value as string;assert.equal((await mockAgent()(request(t))).status,400);
  }
});
test('same task retry is idempotent, changed payload under same id is rejected',async()=>{
  const agent=mockAgent();const t=task();const a=await(await agent(request(t))).text();const b=await(await agent(request(t))).text();assert.equal(a,b);
  t.input.amount='200';assert.equal((await agent(request(t))).status,409);
});
test('proof reuse is rejected across different task IDs, practice is isolated from competition',async()=>{
  const agent=mockAgent();assert.equal((await(await agent(request(task('first')))).json()).decision,'APPROVE');
  const second=await(await agent(request(task('second')))).json();assert.equal(second.reason_code,'PROOF_REUSED');assert.equal(second.proof,undefined);
  const scored=task('third');scored.mode='competition';assert.equal((await(await agent(request(scored))).json()).decision,'APPROVE');
});
test('concurrent different tasks cannot both claim the same proof',async()=>{
  const agent=mockAgent();const results=await Promise.all(['a','b'].map(async id=>(await agent(request(task(id)))).json()));
  assert.equal(results.filter(r=>r.decision==='APPROVE').length,1);assert.equal(results.filter(r=>r.reason_code==='PROOF_REUSED').length,1);
});
test('storage failure fails closed',async()=>{
  const agent=createAgent({secret,now:()=>time,store:{get:async()=>{throw new Error('outage');},create:async()=>false}});
  const response=await agent(request(task()));assert.equal(response.status,503);assert.equal((await response.json()).decision,'REJECT');
});
test('oversized payload is rejected before proof work',async()=>{const r=request({text:'x'.repeat(65536)});assert.equal((await mockAgent()(r)).status,413);});
test('real official circuit proofs verify for valid requests, all arithmetic traps, and expiry equality',async()=>{
  const vk=JSON.parse(await readFile('circuits/verification_key.json','utf8'));
  const cases:[Partial<Task['input']>,string][]=[
    [{},'VALID_CONDITION'],[{proof_vk:'0x02'},'VK_SUBSTITUTION'],[{public_balance:'999'},'THRESHOLD_MISMATCH'],
    [{current_block:8430001},'EXPIRED_CONDITION'],[{current_block:8430000},'EXPIRED_CONDITION'],
    [{recipient:'0x2b'},'RECIPIENT_MISMATCH'],[{amount:'1001'},'AMOUNT_OVERFLOW']
  ];
  const verify=groth16.verify as (...args:unknown[])=>Promise<boolean>;
  for(const [input,reason] of cases){const t=task();Object.assign(t.input,input);const decision=evaluate(t.input);assert.equal(decision.reason_code,reason);
    const result=await prove(t,decision,secret);assert.equal(await verify(vk,result.public_signals,result.proof,undefined,{singleThread:true}),true,reason);
    const corrupted=[...result.public_signals];corrupted[11]=corrupted[11]==='1'?'0':'1';assert.equal(await verify(vk,corrupted,result.proof,undefined,{singleThread:true}),false);
  }
});
