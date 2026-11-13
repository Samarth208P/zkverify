import {test} from 'node:test';
import assert from 'node:assert/strict';
import {submitAndFinalize} from '../src/kurier.js';

const jobId='23382e04-3d57-11f0-af7b-32a805cdbfd3';
const txHash='0x'+'ab'.repeat(32), blockHash='0x'+'cd'.repeat(32);
const evidence={proof:{testOnly:true},public_signals:['1','2']};
const final={jobId,status:'Finalized',proofType:'groth16',txHash,blockHash};
function mock(responses: {status?:number; body:unknown}[]) {
  const requests:{url:string;body:unknown}[]=[];
  const fetchMock:typeof fetch=async(input,init)=>{
    requests.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):null});
    const next=responses.shift();assert.ok(next,'Unexpected additional request');
    return new Response(JSON.stringify(next.body),{status:next.status??200});
  };
  return {requests,options:{apiKey:'secret-do-not-log',network:'testnet' as const,pollMs:0,fetch:fetchMock}};
}
test('Kurier waits for finalization and sends the full VK on testnet',async()=>{
  const m=mock([{body:{jobId,optimisticVerify:'success'}},{body:{...final,status:'IncludedInBlock'}},{body:final}]);
  const result=await submitAndFinalize(evidence,{protocol:'groth16'},m.options);
  assert.deepEqual(result,{network:'testnet',jobId,status:'Finalized',txHash,blockHash});
  assert.equal(m.requests.length,3);
  assert.equal((m.requests[0].body as {vkRegistered:boolean}).vkRegistered,false);
  assert.match(m.requests[0].url,/api-testnet\.kurier\.xyz/);
});
test('Kurier supports 202 pending verification',async()=>{
  const m=mock([{status:202,body:{jobId,status:'pending'}},{body:final}]);
  assert.equal((await submitAndFinalize(evidence,txHash,m.options)).status,'Finalized');
  assert.equal((m.requests[0].body as {vkRegistered:boolean}).vkRegistered,true);
});
test('Kurier never treats optimistic success or block inclusion as finality',async()=>{
  const m=mock([{body:{jobId,optimisticVerify:'success'}},{body:{...final,status:'IncludedInBlock'}}]);
  await assert.rejects(submitAndFinalize(evidence,{}, {...m.options,pollMs:100,timeoutMs:30}),/KURIER_FINALIZATION_TIMEOUT/);
});
test('Kurier rejects failed, mismatched, or incomplete finalized evidence',async()=>{
  for(const body of [{...final,errorDetails:{reason:'bad proof'}},{...final,jobId:'wrong'},
    {...final,proofType:'plonky2'},{...final,txHash:null},{...final,status:'Failed'}]) {
    const m=mock([{body:{jobId,optimisticVerify:'success'}},{body}]);
    await assert.rejects(submitAndFinalize(evidence,{},m.options),/KURIER_/);
  }
});
test('Kurier rejects optimistic failure and never retries a failed POST',async()=>{
  for(const response of [{body:{jobId,optimisticVerify:'failed'}},{status:429,body:{error:'rate limit'}}]) {
    const m=mock([response]);await assert.rejects(submitAndFinalize(evidence,{},m.options),/KURIER_/);
    assert.equal(m.requests.length,1);
  }
});
test('Kurier strips sensitive transport errors and forbids redirected credential requests',async()=>{
  const transport:typeof fetch=async(_url,init)=>{assert.equal(init?.redirect,'error');throw new Error('secret-do-not-log');};
  await assert.rejects(submitAndFinalize(evidence,{}, {apiKey:'secret-do-not-log',network:'testnet',fetch:transport}),
    (error:Error)=>error.message==='KURIER_REQUEST_FAILED' && error.cause===undefined);
});
