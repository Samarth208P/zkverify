import {createHmac,timingSafeEqual} from 'node:crypto';
import {evaluate,hex,parseTask,type Decision,type Task} from './policy.js';
import {prove,artifactsAvailable} from './prover.js';
import {hash,type Store} from './store.js';

type Options={secret:string; saltKey?:string; store:Store; now?:()=>number; prover?:typeof prove; checkArtifacts?:()=>Promise<void>};
type Reply=Decision & {proof?:object;public_signals?:string[];proof_tx?:string};
type Receipt={bodyHash:string;reply:Reply};
const headers={'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'};
function plain(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers});}
function authenticate(raw:Buffer,signature:string,secret:string) {
  const prefix=signature.startsWith('sha256=')?'sha256=':'';
  const digest=signature.slice(prefix.length);
  if(!/^[a-f0-9]{64}$/i.test(digest))return null;
  // The guide does not specify whether the displayed hex secret is decoded. Match the sender's encoding.
  const keys=[Buffer.from(secret,'utf8')];
  if(/^[a-f0-9]{64}$/i.test(secret))keys.push(Buffer.from(secret,'hex'));
  for(const key of keys)if(timingSafeEqual(Buffer.from(digest,'hex'),createHmac('sha256',key).update(raw).digest()))return {key,prefix};
  return null;
}
async function readBody(request:Request) {
  const limit=64*1024;
  if(Number(request.headers.get('content-length')??0)>limit)throw new Error('BODY_TOO_LARGE');
  const reader=request.body?.getReader();if(!reader)return Buffer.alloc(0);
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('BODY_TOO_LARGE');}chunks.push(value);}
  return Buffer.concat(chunks);
}
function validTimes(issued:unknown,deadline:unknown,now:number) {
  if(typeof issued!=='string'||typeof deadline!=='string')return false;
  const a=Date.parse(issued),b=Date.parse(deadline);
  return Number.isFinite(a)&&Number.isFinite(b)&&a<=now+30_000&&now-a<=120_000&&b>a&&b>now&&b-a<=120_000;
}
export function createAgent(options: Options) {
  return async function agent(request:Request):Promise<Response> {
    if(request.method==='GET'||request.method==='HEAD') {
      let ready=options.secret.length>=32;
      try{await (options.checkArtifacts??artifactsAvailable)();}catch{ready=false;}
      return plain({ok:ready,agent:'Astrex-1',protocolVersion:'v1',track:'proof-gatekeeper',status:ready?'awaiting_platform_validation':'configuration_required',competition_validated:false},ready?200:503);
    }
    if(request.method!=='POST')return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD, POST'}});
    if(options.secret.length<32)return plain({error:'AGENT_NOT_CONFIGURED'},503);
    let raw:Buffer;try{raw=await readBody(request);}catch{return plain({error:'BODY_TOO_LARGE'},413);}
    const auth=authenticate(raw,request.headers.get('x-agent-games-signature')??'',options.secret);
    if(!auth)return plain({error:'INVALID_SIGNATURE'},401);
    const signed=(data:unknown,status=200)=>{
      const body=JSON.stringify(data);
      return new Response(body,{status,headers:{...headers,'x-agent-games-signature':auth.prefix+createHmac('sha256',auth.key).update(body).digest('hex')}});
    };
    let data:Record<string,unknown>;try{data=JSON.parse(raw.toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();}catch{return signed({error:'INVALID_JSON'},400);}
    const now=options.now??Date.now;
    if(data.type==='agent-games.preflight.v1') {
      if(typeof data.issued_at!=='string'||!Number.isFinite(Date.parse(data.issued_at))||Math.abs(now()-Date.parse(data.issued_at))>120_000||typeof data.nonce!=='string'||!data.nonce||typeof data.agent_id!=='string')return signed({error:'INVALID_PREFLIGHT'},400);
      return signed({ok:true,protocolVersion:'v1'});
    }
    if(data.type!=='agent-games.proof-gatekeeper.v1')return signed({error:'UNSUPPORTED_TASK_TYPE'},400);
    let task:Task;try{task=parseTask(data);}catch{return signed({error:'INVALID_TASK_SCHEMA'},400);}
    if(!validTimes(task.issued_at,task.deadline_at,now()))return signed({error:'TASK_EXPIRED_OR_INVALID_TIMESTAMP'},400);
    const key=`${task.mode}/tasks/${hash(task.task_id)}`;
    const bodyHash=hash(raw.toString('utf8'));
    try {
      const prior=await options.store.get<Receipt>(`${key}/result`);
      if(prior)return prior.bodyHash===bodyHash?signed(prior.reply):signed({error:'TASK_ID_CONFLICT'},409);
      const claimed=await options.store.create(`${key}/request`,{bodyHash});
      if(!claimed){const priorRequest=await options.store.get<{bodyHash:string}>(`${key}/request`);if(priorRequest?.bodyHash!==bodyHash)return signed({error:'TASK_ID_CONFLICT'},409);}
      let decision=evaluate(task.input);
      if(decision.decision==='APPROVE') {
        const proofKey=`${task.mode}/proofs/${hash(hex(task.input.proof_tx))}`;
        const claim={taskId:task.task_id};
        if(!await options.store.create(proofKey,claim)) {
          const owner=await options.store.get<typeof claim>(proofKey);
          if(owner?.taskId!==task.task_id)decision={decision:'REJECT',reason_code:'PROOF_REUSED'};
        }
      }
      let reply:Reply={...decision};
      // The official circuit has no replay-state input. Do not fabricate a proof of a replay rejection.
      if(decision.reason_code!=='PROOF_REUSED') {
        if(Date.parse(task.deadline_at)-now()<5000)return signed({decision:'REJECT',reason_code:'DEADLINE_TOO_CLOSE'});
        try {reply={...reply,...await (options.prover??prove)(task,decision,options.saltKey??options.secret)};}
        catch {console.warn(JSON.stringify({event:'proof_generation_failed',task:task.task_id}));return signed({decision:'REJECT',reason_code:'PROOF_GENERATION_FAILED'});}
      }
      if(now()>=Date.parse(task.deadline_at))return signed({decision:'REJECT',reason_code:'DEADLINE_EXCEEDED'});
      await options.store.create(`${key}/result`,{bodyHash,reply} satisfies Receipt);
      const stored=await options.store.get<Receipt>(`${key}/result`);
      if(!stored||stored.bodyHash!==bodyHash)throw new Error('RECEIPT_STORE_FAILED');
      console.info(JSON.stringify({event:'task_completed',task:task.task_id,mode:task.mode,decision:stored.reply.decision,reason:stored.reply.reason_code,proof:!!stored.reply.proof}));
      return signed(stored.reply);
    } catch {
      console.warn(JSON.stringify({event:'task_processing_failed',task:task.task_id}));
      return signed({decision:'REJECT',reason_code:'INTERNAL_ERROR'},503);
    }
  };
}
