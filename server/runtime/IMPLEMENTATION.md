# Current agent runtime contracts

APEX 0.8.0 source contract. Root VALIDATION.md contains dated historical snapshots.

`createRuntime({store,emit,fetch?,openrouterBaseURL?,models?,getCredential?})` supplies catalogs, chat, cancellation, tool approval, MCP lifecycle and teams. Calls specify project/session, provider:model and enforced Plan or Build. Remote hosts and workers share persistent job ledgers and conversation leases.

Plan advertises project reads/listing, team status and MCP configuration metadata. Mutations, shell and external MCP calls are blocked before approval in Plan. Build requires exact-action approval. Approved shell/MCP programs are trusted external programs, not OS sandboxes. File containment has filesystem race limits.

Credentials resolve only for the selected provider, from its environment variable or protected vault. No automatic key/provider fallback. Protocols include OpenAI-compatible Chat Completions, Anthropic Messages, OpenAI Responses, Gemini Generate Content and catalog-selected OpenCode families. Fixtures do not establish live account/model compatibility.

Catalog or operator rates reserve a conservative ceiling before inference. Saved maxTurnUSD can lower APEX_MAX_TURN_USD (default $1). Jobs, pools and remote hosts enforce their own additional allowances. Missing rates require exactly APEX_ALLOW_UNPRICED=1; that loses reliable dollar estimation. Missing/invalid usage stays null. Actual provider costs and estimates remain separate. Invalid/oversized replies and ambiguous sends/reads preserve paid holds without replay.

APEX_MAX_TURNS defaults to 8, capped at 20. Serialized context is bounded to 500KB. Historical context is selected as complete recent user turns within 40 historical messages and the serialized bound. Missing tool receipts are request-only outcome-unknown notices; invalid/orphan exchanges are excluded and original records stay untouched. Context projection counts are persisted separately and exposed with /context inspect. Semantic summarization remains open. Replies emit after completion rather than token-by-token. JSON readers enforce byte bounds during streaming, before parsing.

Room/vault excerpts are bounded untrusted reference data. They grant no permissions. Accepted peer work runs in shared-only context and Plan with execution approvals denied. Private read policy checks lexical and canonical paths; the exact generated .apex/teams/UUID/TASKS.md board is the only exception in private APEX state. Local vault retrieval and explicit encrypted backup use separate deliberate private-note access.

Teams use isolated Git worktrees, disjoint scopes and a shared job budget. Reviews are model opinions; command/test receipts remain separate. Integration is explicit. Source Git sync, room events, local vaults and encrypted account backups are distinct mechanisms.

Documents publish complete owner metadata with an atomic hard link, read fresh state under ownership, sync temporary JSON and rename. Empty abandoned lock directories are claimable. Live PIDs are never displaced. Nonce-specific recovery tombstones stop delayed contenders from retiring newer owners. Corrupt metadata or interrupted recovery itself requires inspection; no guessed unlock. Filesystems without working hard links must fail visibly. Ownership is a local-filesystem protocol, not a distributed network-filesystem guarantee.

Run node server/runtime/selftest.mjs for actual tool loops, persistence, denial, cancellation, teams, scope and real stdio MCP. npm test adds process/state, protocol, accounting, Git, credential, plugin, room, backup and actual isolated-browser regressions. These do not prove real-model quality, physical second devices or production readiness.
