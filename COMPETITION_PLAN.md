# Agent Games competition plan

Checked 13 November 2026, approximately 22:35 IST. Objective: maximize legitimate prize chances and scored results. Recheck live rules before each event entry.

## Confirmed position

- Astrex-1 / @sampy4x is Active, tied at displayed rank 9, with 0 points among 18 registered agents.
- Its public competition record shows 0 rounds and 0 tasks. The signed-in dashboard also shows 0 issued, 0 responded and 0 timeouts in round 1. This is an allocation question, not evidence that scored tasks failed.
- The current leader, pecker, has 50 Gatekeeper + 20 VFY = 70 points. MP-gatekeeper-01 has 50 + 9 = 59. Several others have 50 Gatekeeper points.
- Preflight and a recipient-mismatch platform practice task passed; the owner confirmed its proof was verified. Practice does not score.
- A second platform case, AMOUNT_OVERFLOW, passed with the expected rejection and verified proof in 2,599 ms. Its practice deadline was 15 seconds. The practice UI explicitly says practice proofs are not submitted on-chain; its observed input reference is derived from the task UUID. Do not try to resolve that synthetic practice reference through chain RPC. Valid-condition approval still needs platform validation; competition input-reference semantics remain unconfirmed.
- Eight simultaneous synthetic requests to the isolated deployment passed all proof checks; response times were 2.46–5.86 seconds. Retry and replay tests passed. See `reports/qualification.json`. This is engineering evidence, not platform scoring evidence.
- The dashboard displays 62.5% uptime, but its calculation and data source are unverified; it could be placeholder data. Do not infer historical or current downtime from this number without health-check history. A direct production health check returned HTTP 200 with status `ready`.
- Direct output-proof submission to Kurier TESTNET passed at 22:47 IST on 13 November. Kurier returned `Finalized`; a separate RPC check confirmed block 8048290 is canonical and finalized. This is not competition scoring or incoming-payment verification. Production storage still contained only the earlier practice receipt at this check, with no scored task receipts.

Sources: https://agentgames.zkverify.io/leaderboard and https://agentgames.zkverify.io/agents/46b3a0fe-6e63-49fd-9a4e-735b306dcc23 ; owner-provided dashboard screenshot.

## Gatekeeper: highest immediate priority

Tie-breakers on the current event page: more correct decisions, then fewer timeouts. If still equal, agents share the rank and split the prize. This makes complete delivery and correctness more useful than trying to optimize response speed below the deadline.

| Outcome | Points |
| --- | ---: |
| Correct decision | +12 |
| Incorrect approval | -6 |
| Incorrect rejection | -3 |
| Timeout | -2 |
| Missing/invalid proof on a provable task | Additional -2 |
| Proof reliability at round close | +0 to +5 |

The reliability fraction is verified proofs divided by provable tasks. PROOF_REUSED is explicitly exempt from proof submission and that denominator. No proof should be fabricated for a replay rejection.

There are eight tasks per daily round, with a 60-second response deadline. Listed round starts are 13–20 November, 16:00 IST; each closes at 02:00 IST the following day. The homepage closes the event on 21 November. For round 1 the signed-in dashboard explicitly showed 13 November 20:30 UTC = 14 November 02:00 IST.

### Score implications (calculations, not guaranteed results)

- Perfect round: 8 × 12 + 5 = **101**.
- Perfect eight-round season: **808**.
- If round 1 cannot be joined, seven perfect remaining rounds: **707**.
- If eight correct tasks are all provable, missing every proof yields 80 rather than 101: a **21-point deficit per round**. With one replay-exempt task, the deficit is 19.
- A timeout instead of a correct answer costs 14 base points, before bonus effects. An incorrect approval costs 18; an incorrect rejection costs 15.
- Practice is limited to 10 dispatches per active agent per hour and never adds leaderboard points. Use it to cover scenarios, not repeatedly exercise the same known-good request.

Source: https://agentgames.zkverify.io/events/proof-gatekeeper and https://agentgames.zkverify.io/rules

### Execution order

1. Keep the current working deployment available. Entries lock while a round is open; Active status does not prove a newly registered agent was included in an already-created task batch. No extra Join action appeared when the owner followed Enter event; it opened My Agents. Confirm allocation at the next round, and ask organizers about late round-1 entrants if allocation remains unclear. Do not send organizer messages without the owner's explicit instruction.
2. Use remaining platform practice capacity: valid approval first; then VK substitution, threshold mismatch, expiry, amount overflow, and a replay following an accepted valid request. Record both decision correctness and proof status. Recipient mismatch is already confirmed. Local qualification covers these arithmetic cases but is not a substitute for the platform validator.
3. Resolve independent incoming chain-reference validation. The current agent verifies signed envelope fields and generates a proof of their arithmetic relationship; it does not independently retrieve and authenticate the incoming transaction's proof, VK and public inputs. This remains a documented compliance/implementation gap, particularly before claiming production payment safety. Obtain an actual valid task's reference and supported lookup contract; do not substitute a fabricated finality flag or hardcoded transaction result. The public mainnet RPC is reachable and reports a finalized head, but its advertised methods do not include lookup by transaction hash; a block locator/indexer and the incoming circuit's public-input layout are still needed. Kurier's job-status endpoint takes a job UUID plus an API key, not the incoming transaction hash.
4. Inspect scored receipts for timeouts, proof failures and reason-code errors. Change policy only against an observed failure or confirmed protocol requirement; test and ship between rounds when possible.
5. Verify connected GitHub and prize wallet before close. Never create a second competition account or second Gatekeeper entry to evade locking.

## Steal the VFY: eligibility before implementation

- Win +18; draw +9; loss +3; verified-turn bonus +0 to +2; timeout/invalid policy penalty 0 to -2.
- 100 simulated tokens each, 20 simultaneous turns, five Swiss rounds, then a knockout stage. The page lists 13–17 November, currently R1 with 8 agents paired.
- Needs a compatible strategy commitment, signed preflight and practice turn. Entries lock once paired. Late-entry eligibility is **unconfirmed**.
- The event page mentions redeployment between rounds and a commitment frozen mid-match, while the build guide says the same circuit is frozen for all five rounds. Do not assume strategy changes are allowed. Get clarification before committing.
- If entry is available, use a separate agent endpoint and policy state so experiments cannot disrupt Gatekeeper. Benchmark maximum legal extraction against HOLD, FORTIFY and adaptive opponents. Under the published costs and with ample balances, EXTRACT 10 has favorable one-turn balance-difference outcomes; low balances, fortify ordering and multi-turn behavior require a faithful simulator before claiming optimality.
- Maximum nominal Swiss score is 5 × (18 + 2) = 100 before penalties; knockout scoring/tie-break details need confirmation. Do not mistake round-one balances for prize transfers: the balances are simulated.

Sources: https://agentgames.zkverify.io/events/steal-the-vfy and https://agentgames.zkverify.io/build

## Wildcard + Creator: broaden prize chances with one substantive project

Wildcard has no published numerical scoring formula on its current event page. It is manually judged on a useful problem, working implementation and clear explanation; meaningful verifiability and a public demo are bonuses. The endpoint and repository are entry ingredients, not a finished Wildcard product.

Recommended build: an invoice/payment-request assistant that extracts a proposed transfer, checks recipient and spending policy, and produces an independently verifiable policy receipt. Show a genuine user workflow and safe failure examples. A circuit proof establishes its encoded constraints; it does not prove an invoice is truthful or an external payment settled.

Creator is manually judged on technical substance, clarity, zkVerify relevance and originality. Prepare a real demo plus a concise technical explanation of the same project, supported by proof receipts, test results and limitations. Include #AgentGames; on X also tag @ZKVProtocol. Draft locally first; public posts require an explicit publishing instruction.

Each track advertises 100,000 VFY, split 50,000 / 30,000 / 20,000. The public total-score column is not a documented separate grand prize. Optimize for actual track awards, not only the combined display.

Sources: https://agentgames.zkverify.io/events/wildcard and https://agentgames.zkverify.io/events/creator-track

## Next decisions

- Gatekeeper: platform validation of the remaining scenarios and next-round allocation.
- VFY: confirm whether late entry is possible before spending a day building its proof/strategy system.
- Wildcard/Creator: develop one useful demonstrable product rather than four disconnected submissions.
- Overall: results depend on actual task allocation, competitors improving, and manual judging. The calculations above describe attainable points under assumptions, not a promise of winning.
