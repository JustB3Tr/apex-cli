# APEX 0.17: implemented behavior and evidence limits

This build extends the existing application. It does not replace its architecture or claim parity with commercial agents. Public publishing remains separate from local packaging and installation.

## Research opportunity map

| Opportunity | Shipped surface and boundary |
|---|---|
| Consistent task lifecycle | Group, pool, comparison and worker wrappers preserve `waiting_human`, retain funding holds and reconcile explicit continuations without inference replay. |
| Project guidance | Bounded hashed AGENTS/CLAUDE guidance for a selected path; untrusted reference, never permission. |
| Repository retrieval | Literal search, path search, ranged reads and directory pagination with citations and content hashes. Private/generated paths and symlinks are excluded. |
| Safe patching | Exact one-match replacements against the full current SHA-256, scope checks and retained old inodes. External editors are not OS-locked. |
| Context construction | System, tool, history and current-input byte breakdown; output/tool headroom; whole-turn trimming and irreducible-overflow stop. Token counts remain estimates. |
| Durable task state | Human-owned versioned objectives, criteria, constraints, steps and questions via `/task-brief`. Human acceptance is separate from model completion. |
| Historical context | Project-scoped literal `/history-search`, cited saved messages; shared mode excludes private sessions. |
| Memory relevance | Relevant notes plus explicitly pinned preferences/constraints; freshness/provenance labels. No unrelated filler injection. |
| Safe streaming | OpenAI-compatible, Responses, Anthropic and opt-in Google SSE; native replay fields, usage-only frames, bounded partial evidence and incomplete-tool rejection. |
| Visible progress | Coalesced native response preview and phase labels while preserving the composer. `/perf` uses measured local phase timings. |
| Catalog efficiency | Per-provider, coalesced, configuration-sensitive catalogs; inference loads only the selected provider. Free-only pricing is refreshed before each request. |
| Repository map | Incremental lexical declarations/imports with measured cache work. It is not an LSP or a reliable caller graph. |
| Execution isolation | `/isolation`: approved host commands or explicit pinned-image, no-network, credential-free selected-copy Docker execution. No image download or automatic copyback. |
| Failure-aware execution | Repeated identical failed tool calls are blocked; different evidence/actions remain available. Bounded turns and held unknown billing remain enforced. |
| Evidence-based completion | `/evidence JOB_ID`: actual command/edit records, before/after source checks, stale/unknown freshness and unresolved requests. Exit zero alone does not prove requirements. |
| Model recommendations | `/route`: explains capability, context, local-only and price eligibility. No silent model replacement or invented quality rankings. |
| Compatibility | Existing route-specific payloads and compatibility lab plus finish/truncation diagnostics. SSE is explicitly enabled for compatible Google routes. |
| Actionable errors | Saved failure categories distinguish authentication, rate limits, context, permissions, budget, transport/protocol and progress stops. No paid request replay. |
| Collaboration longevity | Authenticated encrypted presence lives in bounded expiring member slots, separate from durable chat quota. |
| Collaboration onboarding | Existing guided setup, `/collaborate`, group tabs, owner opt-ins, explicit context imports and local two-person rehearsal remain available. |
| Session/source history | Existing forks, worktrees, handoffs, receipts, map and passport preserve source/provenance distinctions. They do not turn chat forks into automatic Git rollback. |
| Independent verification | Existing isolated comparison/check and review workflows retain bounded budgets and real receipts; parked runs stay parked. |
| MCP approvals | `/mcp-policy`: human-approved exact tool, identity, schema, argument hash, expiry and use count. Default per-call approval remains; Plan cannot bypass. |
| Terminal and credentials | `--plain`/`TERM=dumb` numbered menus; Windows DPAPI, macOS Keychain and Linux Secret Service provider-vault adapters. No plaintext credential fallback. |
| Consolidated diagnostics | `/workbench`, `/health`, `/context inspect`, `/perf`, `/evidence` and existing extension diagnostics. Local data only. |

## Ambitious ideas, implemented as bounded workflows

Portable failing cases (`/repro`), requirement/source/check maps, versioned task briefs, the attention inbox, isolated implementation comparisons, the compatibility lab/passports, context projection inspection, confined operation rehearsals, editable source-aware knowledge and explicit changeset acceptance cover practical parts of the proposed innovations. They reuse existing local records and explicit approvals instead of introducing ten competing orchestration engines.

## Deliberate limits

- Automatic quality-adaptive routing is not enabled. It needs representative real task outcomes before it can honestly optimize results. `/route` is a transparent recommendation tool.
- No local prediction model is downloaded or started. Slash commands and menus remain deterministic and cheap.
- The symbol index is bounded and lexical. Large or excluded files may require explicit retrieval. `.gitignore` is not evaluated by this index.
- Context estimates are not provider-tokenizer guarantees. Stored history is preserved, but a finite request cannot include every fact or file.
- Host execution is not confined. Environment filtering reduces accidental key inheritance but does not prevent approved host commands from reading files or reaching networks.
- Docker execution works in a selected copy. Its results do not automatically verify the entire host project or apply changes there. Container isolation depends on Docker and the trusted pinned image.
- Provider credential adapters have fixture coverage on macOS/Linux; actual native backend checks on those operating systems are still required. Other account/room encrypted-document storage remains Windows DPAPI-dependent.
- JSON profile storage remains atomically locked. This build reduces presence write amplification, not a wholesale database migration or a claim of unlimited session scale.
- Fixtures, terminal walkthroughs and container checks verify mechanics. They do not establish superior real-model coding quality, customer outcomes, benchmark improvement or immunity to malicious extensions.
- No credits were purchased, paid inference used, npm release published or GitHub release created for this validation.
