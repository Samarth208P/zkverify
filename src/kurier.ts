export type ProofEvidence = {proof: object; public_signals: string[]};
export type Network = 'testnet' | 'mainnet';
export type FinalizedProof = {
  network: Network; jobId: string; status: 'Finalized'; txHash: string; blockHash: string;
};
type Options = {
  apiKey: string; network: Network; timeoutMs?: number; pollMs?: number;
  fetch?: typeof fetch;
};
const endpoints = {
  testnet: 'https://api-testnet.kurier.xyz/api/v1',
  mainnet: 'https://api.kurier.xyz/api/v1'
};
const hash = /^0x[0-9a-f]{64}$/i;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// No raw errors or response bodies escape this client: Kurier URLs contain the API key.
export class KurierError extends Error {
  constructor(public readonly code: string) {super(code); this.name = 'KurierError';}
}

/** Submit an OUTPUT decision proof. This does not authenticate an incoming payment proof. */
export async function submitAndFinalize(
  evidence: ProofEvidence, verificationKey: object | string, options: Options
): Promise<FinalizedProof> {
  if (!options.apiKey?.trim()) throw new KurierError('KURIER_KEY_REQUIRED');
  if (!Object.hasOwn(endpoints,options.network)) throw new KurierError('KURIER_INVALID_NETWORK');
  if (typeof verificationKey === 'string' && !hash.test(verificationKey)) throw new KurierError('KURIER_INVALID_VK_HASH');
  if (!evidence.proof || !Array.isArray(evidence.public_signals) || !evidence.public_signals.every(s=>/^[0-9]+$/.test(s))) {
    throw new KurierError('KURIER_INVALID_PROOF');
  }
  const timeout = options.timeoutMs ?? 45_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120_000) throw new KurierError('KURIER_INVALID_TIMEOUT');
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), timeout);
  const signal = controller.signal;
  const transport = options.fetch ?? fetch;
  const key = encodeURIComponent(options.apiKey.trim());
  const base = endpoints[options.network];
  async function call(path: string, init?: RequestInit): Promise<{status: number; data: Record<string, unknown>}> {
    const response = await transport(`${base}${path}`, {...init, signal, redirect:'error'});
    if (!response.ok) throw new KurierError(`KURIER_HTTP_${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new KurierError('KURIER_BAD_RESPONSE');
    return {status:response.status, data};
  }
  async function pause() {
    if (signal.aborted) throw new KurierError('KURIER_FINALIZATION_TIMEOUT');
    await new Promise<void>((resolve, reject)=>{
      const abort = ()=>{clearTimeout(pollTimer); reject(new KurierError('KURIER_FINALIZATION_TIMEOUT'));};
      const pollTimer = setTimeout(()=>{signal.removeEventListener('abort',abort); resolve();}, options.pollMs ?? 1500);
      signal.addEventListener('abort',abort,{once:true});
    });
  }
  try {
    const submitted = await call(`/submit-proof/${key}`, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({
        proofType:'groth16', vkRegistered:typeof verificationKey === 'string',
        proofOptions:{library:'snarkjs',curve:'bn128'},
        proofData:{proof:evidence.proof, publicSignals:evidence.public_signals, vk:verificationKey}
      })
    });
    const {jobId, optimisticVerify} = submitted.data;
    if (optimisticVerify === 'failed') throw new KurierError('KURIER_PROOF_REJECTED');
    if (typeof jobId !== 'string' || !uuid.test(jobId)) throw new KurierError('KURIER_BAD_JOB_ID');
    if (optimisticVerify !== 'success' && !(submitted.status===202 && submitted.data.status==='pending')) {
      throw new KurierError('KURIER_UNEXPECTED_SUBMISSION_STATUS');
    }
    // Never retry POST automatically: a lost response may already have created a billable job.
    for (;;) {
      const {data} = await call(`/job-status/${key}/${jobId}`);
      if (data.jobId !== jobId || data.proofType !== 'groth16') throw new KurierError('KURIER_JOB_MISMATCH');
      if (data.errorDetails != null && Object.keys(data.errorDetails as object).length) throw new KurierError('KURIER_JOB_FAILED');
      if (data.status === 'Finalized') {
        if (typeof data.txHash!=='string' || !hash.test(data.txHash) || typeof data.blockHash!=='string' || !hash.test(data.blockHash)) {
          throw new KurierError('KURIER_MISSING_FINALIZED_EVIDENCE');
        }
        return {network:options.network, jobId, status:'Finalized', txHash:data.txHash, blockHash:data.blockHash};
      }
      if (!['Queued','Pending','Submitted','IncludedInBlock'].includes(String(data.status))) throw new KurierError('KURIER_JOB_NOT_FINALIZED');
      await pause();
    }
  } catch (error) {
    if (signal.aborted) throw new KurierError('KURIER_FINALIZATION_TIMEOUT');
    if (error instanceof KurierError) throw error;
    throw new KurierError('KURIER_REQUEST_FAILED');
  } finally {clearTimeout(timer);}
}
