# APEX CLI validation

- Terminal-only package: bin/apex.js imports CLI/store/runtime, not Express server, React, Vite or browser launcher. No UI/dist assets are packaged.
- Forty-four CLI/UI tests pass: original CLI/permissions/Plan/UI/vault checks, all built-in provider paths, four Zen API families, persisted Responses/Gemini context, private-state separation, optional local keys, endpoint restrictions, catalog filtering and conservative price tiers. Each inference adapter is checked with offline responses and real project listing. This is protocol/runtime evidence, not a live paid-account compatibility or model-quality benchmark.
- Runtime self-test passes ten groups, including cancellation, shared parallel team board, traversal/Windows junction ownership protection, secret-alias protection and a real MCP stdio handshake/list/call. Paid calls: zero.
- Interactive Windows PTY verified: APEX gradient logo, rounded prompt, actual offline model response, displayed usage, explicit approval followed by a real fixture file write, and Esc cancellation of an in-flight mock request returning to the prompt. Earlier smoke testing covered memory, multiple managed shells and session/usage commands. No paid calls.
- Registry name apex is occupied. apex-agent-cli was available at lookup time, not reserved. npm authentication remains required for publication.
- Actual APEX ConPTY output captured to terminal-buffer PNGs in artifacts, including Shift+Tab Plan mode and a collapsed 12-line paste. Hidden key entry and encrypted reload use a fake credential. Official installed Codex/Claude login command flags were checked with --help. No real account login/logout, subscription inference or paid provider call was run for this change.
- Twenty-two built-ins plus custom Chat Completions, Anthropic Messages, OpenAI Responses and Google Generate Content endpoints support per-provider keys and base URLs. Remote plaintext endpoints and URL-embedded credentials are rejected. Unknown-priced paid calls are blocked before POST, rejected calls are never automatically replayed, and unknown dollar costs remain unknown. Subscription OAuth remains owned by the official native CLIs.
- Live public OpenCode catalog discovery returned 70 supported paid-model entries spanning four API families, with zero inference requests. This verifies discovery, not account access. The local Ollama API did not respond during the October 30 check; no server or model was started. Actual terminal smoke testing also covered saved Alibaba workspace endpoints.
- Known limits: completion-level response events, pipe background shells, no full alternate-screen TUI renderer, no real-model coding benchmark, remote MCP OAuth untested, per-agent rather than account-wide billing guard. These are not represented as complete Claude Code feature parity.

## Version 0.5 collaboration beta, October 30

- New fixtures cover atomic cross-process state, shared job reservations, durable detached worker execution, three real Git checkouts, worktree-isolated agent edits and an independent model review. A deliberately failing shell validation produces a preserved exit-code-7 evidence receipt.
- Three independent profiles exchange real loopback HTTP events encrypted with AES-256-GCM; single-use invitation, viewer role, direct audience, revoked token, restart persistence and modified authentication-data failures are checked. Windows DPAPI protects saved room membership.
- Peer-owner fixture inference uses a distinct fake credential, explicit opt-in/acceptance, finite pool allowance, separate session and shared-only context. Duplicate acceptance and opt-out reject further execution. No real provider inference is used.
- Real Markdown fixtures check MOC links, stable ingestion, human-edit conflicts, private-note isolation, bounded retrieval, stale memory citations and draft idempotence. The Obsidian API fixture opens local notes and saves an outbox draft; plugin installation preserves other settings and does not enable it.
- `node scripts/collaboration-demo.mjs` exercises three profiles, three Git checkouts, three local vaults, an approved fixture peer task and a portable chat export together. Receipt: artifacts/collaboration-demo.json. No physical second PC, real GitHub account, production hub or Obsidian desktop loading is claimed.
- `node scripts/capture-terminal.mjs` captures actual ConPTY output and exercises vault initialization, linked note creation, plugin installation and the budget board. Capture: artifacts/apex-vault-board.png.
- Public npm publication and production deployment remain outside the locally verified build. No training artifacts, Ollama models, original backups, provider caps or data-generation jobs were modified.

Final verification: `npm test` passed 58/58; the runtime selftest passed all ten groups including a real local MCP handshake. The three-profile integrated demo and actual ConPTY vault/plugin/board flow passed. `apex --version` reports 0.5.0 after local global installation. Public npm authentication was checked and returned ENEEDAUTH. Package inspection excludes local state, secrets and artifacts while including the plugin.

## Version 0.6 extension and remote-control verification

- Bundled project MCP passes actual stdio tool/resource/prompt discovery and invocation, private-path refusal, project scoping, lifecycle and protected credential-redaction tests. Live official MCP Registry discovery returned public server metadata; a listing is not a security endorsement.
- Claude-layout marketplace fixtures validate frozen plugin snapshots, file hashes, namespaces, enable/disable/uninstall, explicit skill invocation, progressive resources and the unchanged Plan permission boundary. Scripts/hooks and allowed-tools do not execute automatically.
- Real HTTP remote fixtures verify single-use pairing, viewers/controllers, remote per-action approval, token revocation, origin/CSRF checks, duplicate prevention, billing holds after cancellation, namespaced workflows and local/remote session exclusion.
- `scripts/remote-browser-demo.mjs` uses the actual Playwright MCP server and isolated cached Chromium to pair, submit a model-fixture task, explicitly approve an exact write and verify the host file. 1100px and 390px viewport captures have no horizontal overflow. No personal browser or paid inference is used; physical-phone/public-network behavior remains unverified.
- Actual ConPTY flow now verifies plugin marketplace installation, skill discovery and MCP catalog browsing. Artifact: artifacts/apex-marketplace.png. Browser receipts/captures: artifacts/remote-browser-demo.json and artifacts/apex-remote-{desktop,mobile}.png.
- Windows concurrent-reader tests exposed a transient EPERM on atomic rename. The document writer now retains its lock and retries the same rename with a bounded delay, without deleting the prior state or repeating the mutation. Targeted concurrency and detached-worker checks passed after the fix.

Final 0.6 regression result: 71/71 tests passed, plus all ten runtime/MCP selftest groups and the actual ConPTY marketplace/skill/MCP browse flow. Browser evidence uses actual Playwright MCP with fixture inference, zero paid provider requests and no personal-browser access. Public registry receipt: artifacts/mcp-registry-live.json.


## Version 0.7 verification

81/81 tests passed. Added real HTTP invite-only accounts, separated client keys, encrypted cross-device snapshots, protected Windows session storage, idempotent restoration and zero-sponsor runtime refusal. No paid upstream inference was sent. Optional positive funding and billing behavior use fixtures only; there is no production account host or external penetration-test claim.

Free-only tests verify live catalog price changes stop inference, manually configured zero prices cannot turn a paid catalog entry into an eligible free model, endpoint/model switches are blocked and a 429 produces one request with no fallback. Gemini/Groq require explicit account-plan confirmation. APEX cannot independently enforce their billing tiers. The live public OpenRouter catalog returned 15 eligible text/tool models; the GET lookup did not generate answers.

Terminal tests cover width bounds, actual activity updates, full/reduced/off motion, animation shutdown and hidden password whitespace. Actual ConPTY captures prove setup and multiple animation frames followed by Vault ready; artifacts/vault-animation.json and artifacts/apex-vault-ready.png record the evidence. Ten existing runtime/MCP selftest groups also passed. Package inspection excludes sensitive state and includes the account/free-access docs and sources. Public npm publishing is still blocked on npm authentication.


## Version 0.7.1 cache observability

84/84 tests and ten runtime/MCP selftest groups passed. Provider-field fixtures cover OpenAI, Claude mixed TTL, DeepSeek, Gemini and OpenRouter counters; invalid/missing counts remain unknown. Runtime fixtures verify persisted evidence, stable opaque sticky routing, no keepalive inference and local-only cache commands. Full CLI ConPTY capture verifies the live footer countdown changes while an unsubmitted draft stays intact. The capture uses labeled fixture counters, not a claim of a live provider cache hit. Upstream repositories were researched without installation; EFFICIENCY.md distinguishes proposals, licensing and unverified quality/cost claims.

## Version 0.7.2 approved audit fixes and onboarding

Current verification: 105/105 tests passed, zero skipped, with credential environment values stripped and external Node HTTP blocked. Ten source runtime/MCP selftest groups and the installed-package selftest passed. New checks cover cross-process credential saves, lock recovery, terminal controls, private reads, Git filters/clean-tree push, project-scoped plugin/MCP lifecycle, malformed usage/replies, streaming JSON bounds, explicit setup and actual isolated-browser recovery/focus/reconnect.

Actual ConPTY verified /setup, saved Plan and a zero-dollar local ceiling, one catalog GET, no inference, 12-line paste collapse and /collaborate. The two-profile rehearsal uses separate fake DPAPI keys and a separate peer process, actual encrypted HTTP rooms, two Git checkouts and independently executed code tests. Model feedback is a fixture opinion, not a real-model quality benchmark. Receipts are under artifacts/; APEX_0.7.2_REVIEW.md maps each finding to the implementation and remaining limits.

The local command is 0.7.2. Packaged files match source and exclude private state. Public npm publication, physical second-PC/phone operation, live-provider compatibility, public TLS and Obsidian desktop are not claimed. Storage/backup lifecycle, compaction and token streaming remain open. Earlier version sections above are historical receipts.

## Version 0.8.0 priority pass

124/124 tests passed, zero skipped, with external Node HTTP blocked and credential environment values removed. Ten runtime/MCP selftest groups passed. Fresh ConPTY proved guided setup, /context inspect, retained paste and collaboration help. The two-profile Git/encrypted-room/peer-process workflow passed again using fixture inference and separate fake keys.

New regressions cover all four native API formats after interrupted tool exchanges, whole-turn context bounds without transcript deletion, read-only hub polling, transactional capacity rejection, encrypted archive authenticity, offline restoration of a saved chat/private note, metadata compatibility, deletion quota recovery, pending deletion retry, exact orphan adoption, cross-account denial, missing/wrong exports, and an archive removed while confirmation was open. No real user backup was deleted and no paid model request was made.

Current receipts are versioned under artifacts/priority-0.8.0-* and artifacts/*-0.8.0*. APEX_0.8.0_REVIEW.md records the approach and limits. Whole-document storage, semantic summaries, token streaming and the broader public/platform release matrix remain open. New account retention endpoints require a 0.8.0 service; installation never restarts existing services.
