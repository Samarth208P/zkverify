# Astrex-1

Proof Gatekeeper service for [zkVerify Agent Games](https://agentgames.zkverify.io/build).

Endpoint: `https://astrex-1-zkverify.netlify.app/agent`

## Status

Implements signed preflight, deterministic checks, official Groth16 decision proofs, immutable task receipts, and persistent proof replay protection.

On 13 November 2026, the owner confirmed **platform preflight passed** and a real recipient-mismatch practice task returned **Correct decision / Proof verified**. Ten automated local tests pass. An isolated deployed smoke test also passed authentication, real proof generation and verification (about 2.25 seconds), idempotent retries, and persistent replay rejection. This establishes a working integration, not complete scored-round coverage; other practice trap types still need platform validation.

This is an agent for the tournament's signed task envelopes, not a production payment authorization service. It never transfers funds. The current task contract provides a proof transaction reference and claimed condition fields, but does not document an authenticated chain lookup response or incoming public-input extraction. Independent validation of that incoming chain reference is **not implemented**. Do not treat the resulting circuit proof as evidence that the incoming transaction was finalized. Output proofs are returned to the competition platform for independent verification; this deployment does not submit separate Kurier transactions or claim they are finalized.

## Run locally

Node 22 or newer:

```sh
npm ci
cp .env.example .env
# Fill AGENT_GAMES_HMAC_SECRET locally, never in chat or source control.
npm test
npm run typecheck
npm run dev
```

Local development uses in-memory replay state. Netlify uses strongly consistent site-wide Blobs with create-only claims. Practice and competition have separate namespaces; preview deployments are isolated from production. A reserved proof remains reserved after an interrupted request, preventing unsafe reuse. Retries by the original task can resume.

## Deploy and connect

1. Set `AGENT_GAMES_HMAC_SECRET` in Netlify environment variables, Functions scope and Production context.
2. Run `netlify deploy --prod`. Environment changes require a fresh deployment.
3. Open `/health` to check configuration. A successful health response does not mean platform validation has passed.
4. Edit the registered Astrex-1 agent and set the **full URL**, including `https://` and `/agent`.
5. Run platform preflight, then practice tasks. Inspect actual signed envelopes and response validation errors before enabling scored rounds.

The deployment contains only `public/` and the packaged function. Secrets, logs, tests, and local data are not published as static files. Private task receipts are accessible only through the server-side store, not a public API. Logs contain task IDs, decisions and error categories, never request bodies or secrets.

## Protocol and proof notes

- HMAC-SHA256 is verified over raw request bytes before parsing JSON. The guide does not specify whether the 64-character secret is used as text or decoded hex. The handler recognizes either sender convention and signs the response with the matched encoding and header prefix.
- The official circuit inputs were checked against the downloaded WASM: `registeredVkHash`, `proofVkHash`, `minimum`, `publicBalance`, `expiryBlock`, `currentBlock`, `recipient`, `conditionRecipient`, `amount`, `maxTransfer`, `decision`, `taskId`, `salt`.
- The circuit requires **expiryBlock > currentBlock**. Equality is a rejection. This was confirmed by actual proof tests.
- Hex fields are converted to integers modulo the BN254 field. The task ID uses SHA-256(UTF-8) modulo that field; the private salt is derived with domain-separated HMAC. These serialization choices are not specified by the public guide. The initial recipient-mismatch practice proof was accepted by the platform; additional cases should still be checked. We never modify task values to force a proof to pass.
- Public signals: `[commitment, registeredVkHash, proofVkHash, minimum, publicBalance, expiryBlock, currentBlock, recipient, conditionRecipient, amount, maxTransfer, decision, taskId]`. Salt is private.
- The supplied circuit has no replay-state input. A `PROOF_REUSED` response intentionally has no fabricated Groth16 proof. The current [event scoring rules](https://agentgames.zkverify.io/events/proof-gatekeeper) explicitly exempt these tasks from proof submission and the proof-reliability denominator.
- Valid proof generation is tested, not just response structure. Tampering with a public decision makes verification fail.
- Unknown task types, invalid signatures, expired requests and malformed integers are rejected. Storage failures never approve. HMAC-authenticated requests alone can trigger proof work.

## Official artifacts

Downloaded from `/api/circuit-info` on 13 November 2026:

- https://agentgames.zkverify.io/circuits/gatekeeper.wasm
- https://agentgames.zkverify.io/circuits/gatekeeper_final.zkey
- Registered mainnet VK: `0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0`

`verification_key.json` is exported from the official proving key using snarkjs. Artifact checksums are in `circuits/SHA256SUMS.txt`. These compiled assets are supplied by the competition; no ownership or relicensing claim is made.
