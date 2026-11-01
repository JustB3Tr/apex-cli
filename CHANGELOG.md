# Changes

## 0.15.0

- `/vault` opens a native terminal graph of actual Markdown/wiki/embed connections, with search, selection, local note inspection, backlinks, privacy filtering, zoom/pan and a plain-text alternative. Missing/ambiguous links are explicit; no model request or browser starts.
- The Obsidian plugin adds a local SVG big-picture view with matching parsing, note-opening callbacks, one-hop search, private filtering and zoom/pan. Its parser is bundled for portable loading without a runtime Node/CDN dependency. Actual desktop/mobile app loading remains unverified.
- Reviewed shared/local JSON Canvas exports reference actual notes, remain inside the selected vault and reject changed source notes. Private references are withheld from shared graphs instead of becoming named missing nodes.
- Vault recovery resolves basename links across custom folders. Untagged custom notes stay private in shared retrieval; hidden/draft/escaping paths remain blocked. Full source transcripts are preserved.
- `/vault plugin-update` previews hashes, backs up managed files, preserves custom extras/settings, refuses enabled/stale/symlinked updates and rolls back matching writes after failure. It never auto-enables or deletes backups.
- Current vault guide, local delivery/remaining-work status and release documentation distinguish local installation from public publication. Streaming, large-state scaling and real-device/provider validation remain explicit future work.

## 0.14.0

- Shell mode uses `!` as the composer/submission marker and hides the mode prefix from command text. Home/left/word deletion, pasted commands, history recall and exiting shell mode preserve the actual command.
- Opt-in remote decision inbox: controllers inspect exact proposals, changes, comments and expiry. Only the selected host's decision-owner membership can accept/reject/comment. Device/host binding, stable action IDs, read-only reconciliation and fresh causal validation prevent silent replay. Answers never start work or grant tools. Mobile Inbox/Chat views are separate.
- Durable explicit offline outbox for messages and decision proposals/comments/revisions, with audiences, membership fingerprints, parent versions, expiry and acknowledged/unknown/conflict states. No background flush, queued inference or offline acceptance.
- Sponsorship remains disabled by owner choice. Categorized APEX progress reports link selected result receipts and export after preview. No funding destination, payments or sponsored allowance enabled.
- Licensed public collaboration diagnostics, data-only private-pack import, isolated Plan tools, exact-field assessors, shared total caps, raw results and labelled external/manual evidence. Ambiguous paid failures stop remaining cases and preserve holds.
- Optional configured-model compatibility profiles and dated route dossiers. No model installation, default-provider change, endpoint hosting, listing or automatic chat admission; API operations and general quality remain unverified.
- Windows ConPTY shell-marker/menu proof and Chromium mobile/desktop decision approval over a real encrypted local hub. Zero paid inference and no public publication.

## 0.13.0

- Context recovery instructions and read-only `vault_search`, `vault_read` and `project_map_query` tools. Interactive recovery asks before a model request when history is trimmed or a known cache-window estimate elapsed. Choices are bounded full reread, selective vault/link recovery, recent context or cancellation. `/recover` selects the next turn's strategy without inference. Private checkpoint excerpts preserve links to original saved messages; shared sessions never retrieve private notes.
- `/credit`: authenticated room proposals, exact credited-member approval/revocation, uncertain-publication reconciliation and explicit receipt attribution. No automatic Git coauthors, public identities or licensing claims.
- `/clinic`: original willing-maintainer guide, consent attestations, one-issue records and selected receipt/review links. Remote acceptance remains a human-recorded observation; no outreach or real-project acceptance is fabricated.
- `/recipes`: three original contract-backed workflows in `apex-dev`, frozen-snapshot contract inspection and separate static/fixture/user-outcome evidence. Installed recipe hashes must match before invoking the current recipe. Metadata grants no permissions.
- `/capabilities`: exact configured API-route observations with explicit text/tool/client-cancellation probes, isolated project state, finite ledger caps and no retry/fallback. Serving host, task quality and server-side cancellation remain unproven.
- `/console` and `/board`: keyboard menus for people, local agents, pending answers, tasks, decisions, evidence and costs; plain structured text is available without a TTY. Live membership failures retain the local board with a visible notice.
- Windows ConPTY walkthrough verifies the recovery choice and cancellation before POST plus the new menus. Source regressions cover real encrypted-peer attribution, shared-vault privacy, bounded rereads, recipe integrity and isolated capability probes. No paid inference or public publication performed.

## 0.12.0

- `/packet`: selected excerpts and chat records, exact previews and diffs, explicit audience, purpose, expiry, source freshness and immutable revisions. Uncertain publication reconciles read-only without replaying the send.
- `/handoff`: deterministic private resume briefs from pending work, Git state, actual evidence, unresolved integrations and billed/held costs. Shared MCP handoffs omit private jobs, costs and memory.
- `/vault-task`: typed Obsidian drafts, explicit promotion to versioned room offers, increasing draft revisions and adjacent outcome notes that preserve human edits. Markdown never starts a job or approves work.
- `/map`: typed declared relationships, citations, stale/archived records, incremental changes, bounded queries and shared-only JSON Canvas export. Private execution/memory records stay out of shared maps.
- `/receipt`: selected result records exported as static HTML, Markdown or JSON after exact preview. Model text, human claims, shell/tool evidence and unresolved billing remain distinguishable; changed source records invalidate stale exports.
- Actual Windows terminal walkthrough, isolated Chromium receipt rendering, Obsidian SDK fixtures and encrypted-room/MCP tests. Actual Obsidian desktop loading remains unverified. No paid inference, publication or deployment performed.

## 0.11.0

- Guided collaboration menu and isolated two-person rehearsal using real Git/HTTP plus labelled fixture inference, with no paid calls.
- Authenticated room task agreements: counteroffer/confirmation, exact-version acceptance, separately confirmed read-only execution with an allowance, manual delivery and sender acknowledgment. Dependency cycles, stale bases and duplicate runs stop with evidence preserved.
- Versioned human-owned decisions with comments/challenges, owner-only acceptance and superseding proposals. Locally synced accepted decisions and active work enter model context as untrusted references, never permission grants.
- Expiring file/interface claims with branch/base and bounded matching changed-file metadata, overlap warnings and owner acknowledgments. Claims remain advisory.
- Selected-source/shared-record project passports: exact preview, new-file export, validated untrusted import, MCP resources and confirmed official Codex/Claude handoff with local version checks.
- Durable chat forks with parent/cutoff lineage, preserved tool exchange snapshots and inherited-usage exclusion. Account backups retain lineage and inherited usage; they retain their existing text-only restore boundary.
- GitHub repository/issues/PR adapters and verified Vercel preview adapter, human account/target menus, official login handoffs, bundled MCP tools and two inert workflow plugins. No live publication or deployment is performed by the build.
- Integration publication intents and uncertain outcomes persist; additional publications stop until the human records a verified outcome. No automatic paid/action replay, Git push, PR merge or production deployment.


## 0.10.0

- Centered terminal popup setup with existing/create/skip vault choices, provider/model search, short price/ceiling prompts and permissions. The new wizard runs once per profile and retains the existing theme.
- `/model` now filters by provider before model search. `/effort` persists effort and applies native controls only on supported routes, with explicit prompt-guidance fallback elsewhere.
- At 110×32 or larger, show usage, latest request context/capacity, price estimates, actual rolling history-trim thresholds and connected/inactive/disabled MCP rows. Click a row or use F4 to configure it.
- MCP popups support inspect, enable/disable, approved connect, hidden credentials, confirmed removal and curated marketplace configuration.
- Known model context capacity adds an approximate 80% input trim threshold, while retaining independent message/byte bounds and original saved history. No semantic model summary or tokenizer-exact counter is claimed.
- Raw terminal control reports and mouse sequences are isolated from user input. Menus preserve unsent drafts and restore the previous terminal screen.


## 0.9.0

- First interactive launch offers optional vault initialization, multiple provider setups and an explicit permissions choice. Setup persists once per profile and can be reopened with `/setup`.
- Slash-command picker with prefix matching, arrow selection, Tab completion and partial-command Enter completion.
- Bottom-left permissions indicator, Ctrl+P cycling and `/permissions`. Auto uses local bounded-write and literal location/time policies; protected files and other execution/external actions still ask.
- `!` shell mode saves bounded, cancellable command/output receipts locally. Model debugging requires explicit sharing consent; `/commands` supports later inspection/sharing. Pasted shell commands need execution confirmation.
- Vault opt-out is respected during collaboration room setup. Existing chats, vaults and provider credentials are preserved.
- Windows real-terminal proof covers restart persistence, actual fixture Auto writes and declined shell-output sharing. No paid inference or npm publication.


## 0.8.0

- First clean GitHub runner exposed Windows short-path/canonical-path mismatches in Git saves and plugin skills. Root aliases are now normalized before containment comparisons, with a regression test.


- Whole-turn model context with explicit interrupted-tool unknown results, orphan/invalid-exchange handling, bounded history selection and `/context inspect`. Original transcripts remain intact.
- Read-only hub GET polling, transactional aggregate/count limits and `/room status`; existing history is preserved at capacity.
- Encrypted backup exports, confirmed verified delete/prune, offline password restore, retryable deletion tombstones and exact-byte orphan-upload recovery. No automatic pruning.
- Compatibility checks and additional protocol, quota, interruption, filesystem and offline-recovery regressions.

The document backend, semantic summaries, token streaming and broader release validation remain separate work.

## 0.7.2

- Guided `/setup` for provider/model/prices, Plan mode and a per-turn ceiling; `/collaborate` and a two-profile rehearsal.
- Transactional credential saves across processes; atomic lock-owner publication, ownerless-lock recovery and Windows rename retries.
- Terminal control-sequence containment, consistent private reads, metadata-only memory freshness, safe Git status and clean-tree pushes.
- Project-scoped plugin lifecycle and associated MCP configuration.
- Exact unpriced opt-in, validated reply/tool shapes, normalized token accounting, bounded JSON reads and preserved billing uncertainty.
- Browser same-ID submission recovery, GET-only reconnect and stable approval focus; remote help and vault-index filtering corrected.
- Current runtime, onboarding and contributor documentation, plus regression/browser/terminal/collaboration evidence.

Production scale/retention, full conversation compaction, token streaming and the broader release matrix remain open. No public npm publication or hosted service is implied.

## 0.16.0

- Live encrypted group timelines, explicit @apex invocations and personal/group terminal tabs with separate drafts/history.
- Owner-local pooled allowances, per-turn reservations, concurrent scoped agents and durable no-replay turn claims.
- Mid-turn steering at safe model boundaries, owner/requester authorization and explicit shared-context imports.
- Reviewed source snapshots across profiles, baseline/content conflict checks and retained backup receipts.
- No public release, paid inference, external hosting or sponsored usage enabled by this change.

## 0.17.0 local evolution build

- Reconciled human-waiting jobs across group chat, shared allowances and alternative implementations without replaying requests.
- Added bounded repository retrieval, lexical indexing, scoped project guidance and approved hash-guarded patches.
- Added provider-native streaming, incomplete-reply rejection, headroom budgeting and typed failures.
- Added durable task briefs, saved-chat search, evidence freshness, local phase timings and model eligibility explanations.
- Added opt-in isolated shell copies, exact expiring MCP grants, cross-platform provider credential backends and plain terminal menus.
- Added ephemeral encrypted presence, human attention, pinned requirements/orientation/changesets, portable failure cases and confined rehearsal/extension trials.
- Retains approval, privacy and original budget boundaries; no automatic paid retries or public release.

## 0.17.1 public release preparation

- Fixed Windows hosted-runner credential startup by loading the signed framework assembly directly, preserving the sanitized child environment and DPAPI protection.
- Removed native encryption startup from the vault metadata lock so unrelated key saves cannot block each other.
- Fixed canonical vault Canvas destinations through Windows folder aliases while preserving outside-vault rejection.
- Added bounded CI workers and regression coverage; 316 tests, runtime self-tests and package checks passed on GitHub.
- Refreshed the public README, package metadata and GitHub-built release-artifact workflow. Registry publication is verified separately.
