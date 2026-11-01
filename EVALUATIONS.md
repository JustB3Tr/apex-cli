# Collaboration diagnostics and optional endpoint lab

`evaluations/cases.json` contains three original MIT-licensed **public diagnostic** cases: stale decision approval, an unknown shell outcome and private/shared note selection. They ask for a narrow structured response and use deterministic exact-field assessors. They do not execute a real two-person project or measure general coding quality, explanation quality, productivity or benchmark improvement.

Public cases are visible in source and may be contaminated. They are not held-out benchmarks. The runner records pack version/hash, case order and randomization seed, raw responses, errors, elapsed time per case, usage and billed/held cost observations. It makes no single superiority score or cross-harness performance claim.

## Explicit consent and isolation

Open `/eval`, inspect the cases/method, and approve a finite total $0-$1 cap within any lower existing runtime limits. Each case uses a fresh scenario-only Plan session in a separate project folder. Only scoped `read_file` and `list_files` are available. Unadvertised private vault, workflow, MCP and mutation tools are also rejected. Private notes/memory and normal project files are not loaded. This is an application tool boundary, not an OS process sandbox.

All cases share one job allowance. A failed or ambiguous paid response stops later cases, preserves raw/error evidence and keeps unresolved reservations. There is no automatic retry, provider fallback, key switch or inference replay. A $0 allowance does not make an unknown-price paid API free.

`/eval import {"file":"PATH","rightsConfirmed":true}` imports bounded JSON case data after confirmation. Packs declare version, license, authors and either `public-diagnostic` or `private-held-out`; cases contain data and exact-field expectations, never executable scripts. Rights and held-out isolation are user attestations, not independent verification. Keep private packs and expected answers out of public reports when appropriate. Models receive prompts/scenarios, not assessor expectations.

`/eval external JSON` records a manual or other-harness raw response against the same case/hash. Label harness/model and actual cost or null. APEX does not independently verify external execution or billing. Compare equivalent cases, versions, context and permissions. There are no fabricated human-baseline results bundled.

Inspect results and explicitly export a new `.json` snapshot. Raw responses may contain private data even after known-secret scrubbing. No public report, benchmark submission or outbound message is automatic.

## Optional compatibility lab

`/lab` profiles an **already configured** provider/model and a trial purpose without inference. It does not create an endpoint, install a model, switch defaults or claim that a service exists. Configuration is fingerprinted by API base URL, protocol and model ID; routed serving hosts and actual model identity remain unverified.

A profile can run a separately approved text, read-only tool or client-cancellation probe, or the diagnostics above. Every run requires a fresh finite budget confirmation. Dossiers collect matching dated route observations and saved diagnostic records. Changed routes block further profile trials until a new profile is reviewed. Probe expiry is a seven-day client convention, not a provider guarantee.

Authentication, metering, rate limits, uptime and rights remain unaudited owner declarations unless separately evidenced. Public diagnostics do not establish general model quality or API readiness. Latency under load, long-context behavior, reliability, rights, operations and independent assessments need separate work. Client cancellation does not prove server-side cancellation or settled billing.

Imagination or another experimental model can use these optional CLI tools after its real endpoint is configured. This upgrade performs no model development, hosting, listing or training work. Ordinary chats are never automatically admitted to the lab. Reviewed dossier exports never submit a provider application or publish automatically.
