# Collaborative work in APEX

`/vault` now opens the local note graph. See [VAULT_GUIDE.md](VAULT_GUIDE.md) for native/Obsidian graph controls, shared/local Canvas export and safe plugin updates. [ROADMAP_STATUS.md](ROADMAP_STATUS.md) separates delivered local tooling from external validation and deferred work.

APEX provides selected context, resume briefs, vault task drafts, a typed map and result exports. These are available from `/work` as compact menus. They use saved records and explicit choices rather than automatic agent publication.

## Remote decisions, offline drafts and optional diagnostics

- Start remote control with a finite allowance and explicit `allowDecisions:true` to enable decision answers, separate from tool `allowApprovals`. Only paired controllers receive actionable previews of decisions owned by the host's local membership. Viewers, other devices' previews, expired snapshots, stale versions/hashes and revoked memberships are refused. Terms, changes and comments are inspectable; mobile Inbox/Chat views are separate. Answers record acceptance/rejection/comment, never task execution or spending approval. Owners can revise rejected proposals. No remote listener or public tunnel starts automatically.
- Five-minute previews bind host, project, room, device, owner, version and hash. Stable request IDs make repeat inspection of a submitted answer idempotent. **Check publication** refreshes authenticated room history without reposting. Changed proposals require fresh answers. The PC must stay on; viewport tests do not prove physical-phone/separate-network behavior.
- `/outbox` prepares selected messages and decision drafts using local membership and observed versions while offline. No inference, task run, task acceptance or offline decision approval can queue. Publishing one draft needs exact preview/confirmation, complete room refresh, active recipients/membership, unchanged key fingerprint and matching causal state. Expiry supersedes drafts; stale decisions become conflicts. Sending/unknown evidence remains until matching publication is observed. Refresh is read-only; abandonment preserves evidence and does not undo remote effects. There is no automatic flush or rebase.
- `/support` reports disabled sponsorship and zero sponsored inference. `/research` creates user-written progress snapshots linked to selected result receipts. JSON exports are explicit and preserve limitations/held costs. This is not audited donation allocation or scientific proof. No funding links, accounts, collection or public report is enabled. See [SPONSORSHIP.md](SPONSORSHIP.md).
- `/eval` offers original MIT public diagnostics, rights-attested private JSON packs, fresh scenario-only Plan sessions, exact-field assessors, shared finite caps and raw results. Only scoped read/list tools are allowed; private memory, vault, workflows and MCP calls are blocked even if unadvertised. Ambiguous paid failures stop later cases and retain reservations. External/manual baselines are user-supplied observations. Public diagnostics are not coding benchmarks or secret held-out tests. See [EVALUATIONS.md](EVALUATIONS.md).
- `/lab` profiles an already configured model without inference. Separately approved probes/diagnostics feed a dossier matched to its API-route fingerprint. Changed routes need fresh profile review. Serving-host/model identity, uptime, auth/metering security, rights, long-context behavior and provider listing remain unverified. No model is trained, installed, served or selected by default. Ordinary chats are not automatically sent to the lab.

## Recover context without loading everything

APEX 0.13 prompts before sending the next interactive model request when older turns fall outside the current context selection, or a previously observed cache window's estimate has elapsed. Cache expiry does not erase saved history and does not prove provider eviction. Unknown cache TTLs stay unknown. The prompt offers selective vault/link recovery, rereading the saved conversation, continuing with recent context or cancelling. Full reread fails before sending if all saved turns cannot fit the existing byte/model bound. This is an approximate client bound, not a provider-tokenizer guarantee.

`/recover` opens the same strategy choices for the next turn. `/recover vault`, `/recover reread` and `/recover recent` work without a menu; none makes a model request. The choice is local to the current terminal and applies once. Existing budget/permission settings still apply. Noninteractive runtime calls retain bounded recent context unless an explicit recovery choice is supplied; they never pretend a human answered a popup.

Vault recovery saves a private checkpoint of bounded older user/model excerpts with original message IDs/hashes when trimming occurred. Full original history remains in APEX; checkpoint excerpts are not a semantic summary or execution proof. APEX loads a bounded set of keyword-matched notes and one-hop explicit local wikilinks. Read-only `vault_search`, `vault_read` and `project_map_query` tools let the agent inspect more relevant connections in Plan or Build. Hidden/private paths, drafts and escaping links are refused; shared-only sessions cannot read Private notes or local memory graph nodes. No remote wiki/image resources are loaded.

The system instructions require citations, current-source checks and honest missing-context reports. A prompt cannot guarantee every model follows it. Selective recovery can miss details and does not automatically reduce your bill; cache discounts, transmitted context capacity and vault retrieval are different things. Do not repeat uncertain tool actions or paid sends because a note is missing.

## Credit, clinics, recipes, capability evidence and the work console

- `/credit` proposes attribution to an active room member with a role and human/tool/upstream category. Only that member can approve or revoke the exact proposal hash. Display names and real-world identities remain self-declared. Attach an approved credit to a new selected receipt explicitly; revocation seen in local room history invalidates stale exports. No commit trailers, Git authorship, public badges or licensing assertions are added. An uncertain publication blocks another credit send until read-only reconciliation succeeds: `/credit reconcile INTENT_ID`.
- `/clinic` prepares/tracks one existing GitHub issue with 2-8 willing participants. Consent is the human's attestation, not proof APEX contacted anyone. Outcome records require a selected project receipt and same-repository review link. Submitted/accepted/declined is explicitly a human observation, not independently verified GitHub state. The [clinic guide](MAINTAINER_CLINICS.md) covers scope, approvals, review and voluntary feedback. Running real clinics requires willing people; none is claimed completed by this build.
- `/recipes` inspects three versioned original contracts: maintainer clinic, reproduce/fix/review and decision review. Contracts describe context, permissions, requirements, evidence and paid dependencies. Static validation, fixture references and user-outcome records remain distinct. `/plugin inspect apex-dev@apex-official` shows frozen recipe metadata; installation remains explicit. The recipe menu verifies the installed contract hash before invoking it. A matching hash establishes content identity, not quality or tool approval. `/recipes outcome JSON` records a selected receipt with its exact contract version/hash and a human observation.
- `/capabilities` inspects current model configuration and dated observations. Text, read-only tool and client-cancellation probes each require an exact preview and a finite $0-$1 allowance within any lower existing settings. They use a separate isolated project/session/job, your current provider and the normal ledger. No fallback, key switch, blind retry or test on your actual code occurs. Observations expire after seven days and include API-route hashes; serving hosts behind routers are not observed. A cancellation may occur before sending or after a request was marked sent. It never proves server-side stop or final billing. These are compatibility observations, not real coding benchmarks.
- `/console` or `/board` opens people, agents, pending answers, tasks, decisions, evidence and costs with keyboard inspection. Opening a record or workflow does not approve it. Refresh explicitly pulls room history; offline live-member failures are labelled while local work remains visible. `/console text` and `/board text` return structured plain text without animation or color-only status. No room/private output is automatically published.

Open `/work` or `/collaborate` for the compact workflow menu. Each person keeps their own checkout, APEX profile, provider credentials and private chats. Shared records use the existing encrypted room transport. A room member name is self-selected; authorization is bound to its authenticated membership token, not a claim in agent text.

## 1. Experience a two-person project

`/rehearse` asks before creating a new isolated folder under your APEX home's `rehearsals/`. It creates Alice/Bob profiles, two actual Git checkouts, an ephemeral local hub, task negotiation, declared overlapping work, a read-only fixture agent, delivery/acknowledgment, an accepted decision and an exported passport. Its report labels fixture inference and zero paid calls. It preserves the owned folder and closes the hub. This is not a physical second-PC or real-model quality test.

To use your own projects, select **How to host a hub** in `/collaborate`. Start a hub separately, then use **Create room**, **Invite a teammate**, and **Join a room**. Two PCs need an explicitly configured reachable HTTPS endpoint with trusted TLS. APEX does not change firewalls, buy hosting, transmit invitations for you or enable Git synchronization automatically. See COLLABORATION.md for the existing transport and Git workflow.

## 2. Agree on tasks before agents run

`/task` opens offers and saved work. An offer records recipient, goal, selected files/interfaces, dependencies, acceptance evidence, repository/base, version/hash and a finite allowance. Recipient counteroffers need sender confirmation before the recipient accepts them. Acceptance binds exact terms and does not execute tools or spend money.

Power commands inside APEX:

```text
/task offer {"target":"MEMBER_ID","goal":"Review the parser","files":["src/parser.ts"],"acceptance":"Cite source and untested edge cases","maxUSD":0.05}
/task counter TASK_ID {"acceptance":"Include Unicode edge cases"}
/task confirm-counter TASK_ID
/task accept TASK_ID
/task run TASK_ID
/task deliver TASK_ID {"result":"Observed behavior and limitations","evidence":["src/parser.ts:42"]}
/task ack TASK_ID
```

Each human mutation is subject to current permissions and confirmation. The recipient's separately confirmed run uses their selected model and own credentials, a fresh shared-only Plan session, the agreed job allowance and existing lower runtime limits. It cannot edit or execute shell/MCP mutations. A changed base, revoked sender, stale version, unresolved dependency or duplicate run stops the operation. Dependencies must be acknowledged before dependent tasks are accepted. Esc/Ctrl+C cancels an active local task turn; any unknown billing remains preserved by the job ledger.

One saved run is allowed per accepted task hash. Inspect its job and evidence instead of blindly repeating it; negotiate a new version for new work. Execution never publishes a delivery automatically. The recipient explicitly delivers a summary/evidence, and only the sender acknowledges it. Scope declarations organize the work; they are not an OS read sandbox or a quality guarantee.

## 3. Move selected context between harnesses

`/passport` selects source files and optional locally synced shared task/decision records, previews the exact packet, and exports a new file without overwriting an existing one. Private chat history is not added. Private file paths and escaping symlinks are rejected, and known secret patterns are scrubbed/rejected. Review text yourself because arbitrary secrets cannot all be recognized.

```text
/passport preview {"files":["src/parser.ts"],"taskIds":[],"decisionIds":[]}
/passport export {"file":"C:/handoffs/parser.json","files":["src/parser.ts"]}
/passport import C:/handoffs/parser.json
/passport handoff codex C:/handoffs/parser.json
```

Packets are versioned, bounded, non-executable reference data with selected file hashes, branch/base, provenance and a result format. Imports save an untrusted local record and run nothing. They do not install plugins, connect services, grant permissions or adopt decisions into the room. The bundled project MCP exposes `project_passport`, `collaboration_board`, and `apex://project/passport`; the default resource includes no files or private chats.

Native handoff checks the installed official CLI version and separately confirms using its account/tools/billing. Codex receives a read-only filesystem sandbox; Claude Code receives the existing Plan/tool restrictions. The native harness owns its MCP policy and approvals. Large packets are preserved as a private local handoff file rather than exceeding command-line limits. No real native-agent inference was run for this release.

## 4. Keep decisions inspectable

`/decision` proposes a title, rationale, alternatives, evidence and a human owner. Members can comment/challenge. Only the owner accepts the exact proposal version/hash. Revising an unaccepted proposal or superseding an accepted decision creates a new proposed version; old acceptance and comments remain visible. Superseding does not approve the replacement automatically or transfer ownership.

Accepted decisions, active tasks and claims enter later APEX model context as bounded, locally synced, untrusted project references. They do not override user instructions or approve tools. Markdown views are written when a vault exists; edits in Obsidian cannot approve protocol events. Invalid or conflicting room events remain preserved and visible in protocol state.

## 5. Declare overlapping work

`/claims` shows file/folder and interface declarations with branch, base, matching changed-file metadata, task reference, owner, release state and expiry. Claims last at most 24 hours. Overlapping cross-owner paths or identical interface names produce advisory warnings. Both owners can acknowledge the other claim; only the owner releases a claim. Expired/released records remain in history.

```text
/claim new {"resourceType":"file","resource":"src/parser.ts","hours":1}
/claim new {"resourceType":"interface","resource":"ParserResult v2","hours":2}
/claim ack CLAIM_ID
/claim release CLAIM_ID
```

Claims do not lock Git, prevent edits by other tools or infer every semantic dependency. A read-only task run warns before proceeding with unacknowledged overlaps. The map is based on explicit declarations and observed Git metadata, not a promise of conflict-free parallel work.

## 6. Share exact context packets

Open `/packet` to select project-file line ranges and optionally one saved chat message. Supply a purpose, expiry and either a local destination or a room audience. Review the complete payload and revision diff before publishing or exporting a new JSON file. No history is included implicitly. Saved revisions preserve content hashes, observed source hashes and timestamps; changed or unavailable sources block publication/export until rebuilt. A selected packet can separately be sent to your model under the existing budget and permission rules.

Expiry stops later inclusion in APEX room context; it cannot erase a recipient's saved copies. Received packets are untrusted reference data, never permission grants. Known secrets and selected literal redactions are filtered, but you must review arbitrary private text yourself. A timed-out publication remains uncertain: inspection reconciles its stable event ID from room history without reposting it. Do not rebuild/repost an uncertain send as a workaround.

## 7. Resume with an evidence-backed handoff

`/handoff` shows pending tasks and ownership, branch/base and working-tree state, stale work, saved tool observations, unresolved integration actions and local job costs, including held amounts. Save a private vault snapshot or compare it with the previous one. Bare `/resume` opens the chat picker with optional handoff inspection; `--continue` offers inspection before continuing. These deterministic briefs do not call a model or automatically resume a job.

The shared project MCP exposes `project_handoff` and `apex://project/handoff` using shared tasks/claims only. Private jobs, billing, tool output and memory are excluded from that response. A saved brief is a point-in-time observation, not a guarantee that remote state or billing is final.

## 8. Round-trip tasks through the vault

Install the bundled plugin through `/vault-task` and enable it yourself in Obsidian. Its **Draft a local task for APEX** command writes a typed `apex-task` block in `Outbox/<id>.task.md`; **Revise the current task draft** increments its revision while preserving freeform notes. The draft includes the goal, acceptance evidence, file scope, optional room recipient and maximum allowance. Nothing executes in Obsidian.

In APEX, `/vault-task` previews the exact draft. Joining a room, choosing a recipient and explicitly confirming promotion creates a versioned offer through the existing task protocol. It does not accept or run it. A changed same-number revision is rejected; a later revision creates a separate linked offer and leaves old agreements intact. Ambiguous promotion is reconciled from room history rather than blindly retried.

`/vault-task` **Refresh task outcomes** writes private adjacent outcome notes with draft/task revision, status, exact task hash, acceptance criteria and recorded evidence. Draft text and manually edited outcomes are preserved with the existing vault conflict behavior. The plugin's task/outcome panel opens those notes. Its files do not contact a server. Existing customized plugin installations are preserved: installation refuses differing files instead of overwriting them. Use `/vault plugin-update` for an exact-hash preview and backed-up update after disabling APEX Vault in Obsidian. Additional custom files and enabled-plugin settings remain preserved. Automated tests execute plugin behavior with SDK fixtures; actual Obsidian desktop/mobile loading remains unverified.

## 9. Inspect a typed project map

`/map` builds shared or private views of declared tasks, decisions and their versions, owners, files, interfaces, claims and evidence. Local views can additionally include jobs, tool receipts and memory. Links retain record citations and distinguish observed relationships from explicitly authored links; this is not inferred semantic architecture. Missing old nodes remain archived/stale, and index versions record changes. Queries are bounded by depth and result count.

Only the shared view can export a new `.canvas` file. It uses text nodes and edges in the [JSON Canvas 1.0 format](https://jsoncanvas.org/spec/1.0/), with escaped untrusted labels and no remote/image nodes. Shared MCP `project_map_query` likewise excludes private execution and memory records. The index uses locally synced room history; refresh the room before relying on its freshness.

## 10. Export selected result receipts

`/receipt` selects a shared task and/or local job and shell receipt, asks for a problem and a user-declared environment label, then previews the exact result. Advanced selection supports additional explicit evidence IDs and commit metadata. Export a new `.html`, `.md` or `.json` file. No page is hosted or published automatically.

Receipts distinguish model-written answers, human deliveries, recorded tool observations and actual shell exit codes. They retain billed amounts and unresolved holds separately; unknown charges are never reported as zero or final. Environment labels are user-supplied, not independently verified. Export checks source fingerprints again, so changed evidence or billing requires a rebuilt receipt. Integrity hashes detect content changes; they are not signatures or independent proof of correctness.

HTML exports contain a restrictive content policy with no scripts or remote resources. Markdown puts untrusted content inside escaped code blocks. Known secrets are scrubbed and identifiers are anonymized by default; review free text and use literal redactions before sharing. Real Chromium fixture testing verifies inert rendering, not the quality of the underlying model result.

## Chat branches

`/fork` opens current-point/message selection and a name. `/fork TITLE` forks immediately from the latest saved point; `/fork at MESSAGE_ID TITLE` uses a selected parent message. `/forks` lists lineage. Parent and child messages have separate IDs; the source transcript and saved tool receipts remain intact. Forking itself replays no action. Incomplete exchanges retain the existing unknown-outcome context repair behavior.

Inherited usage is retained as historical metadata and excluded from new-session usage/cost totals. Account export/restore retains fork lineage and that inherited marker. Account restores retain their existing text-only, untrusted-history boundary; they do not restore executable provider replay state or active jobs.

## GitHub and Vercel

`/github` supports official CLI login handoff, explicit OWNER/REPO connection, repository/issues/PR reads, issue publication and draft PR creation from explicitly pushed head/base branches. It does not push Git, fork repositories, merge PRs or change visibility automatically. Publication previews title/body and confirms the exact repository. Multiline bodies use a temporary body file and literal argv, not shell interpolation.

`/vercel` uses the official Vercel CLI, an existing `.vercel/project.json`, and a successful non-interactive project/team inspection. Missing CLI, missing login/link, unknown output shape, changed link or mismatched remote target stops the action. Connection does not auto-link. Preview deployment separately confirms `projectId@orgId`, uploads/builds project files and may consume your Vercel resources. Production aliasing, purchases and provider changes are not exposed.

Both service menus offer **Add agent tools** for the bundled APEX GitHub + Vercel MCP recipe. Configuration does not start it. F4 or `/mcp` approves connection; every model-triggered external tool action still requires harness approval, and Plan hides mutation tools. Targets must be connected by the human first. Login and credentials remain with official CLIs/environment; APEX does not copy tokens from other agents.

Uncertain publication/deploy outcomes are saved as unresolved intents and block another service publication. Inspect the service yourself, then use the saved-action menu to record a verified observation. This is manual reconciliation, not an automatic retry or billing proof. CLI equivalent: `/github reconcile {"id":"ACTION_ID","observation":"Verified outcome"}` or the same under `/vercel`.

Built-in plugins:

```text
/plugin install apex-work@apex-official
/plugin install apex-services@apex-official
```

These install original inert workflow skills, not hooks or pre-approved actions. The service MCP is separately configured and approved. GitHub argv/body behavior and Vercel target/preview behavior have fixture coverage. GitHub CLI help was checked locally; Vercel CLI was absent, so live Vercel authentication, output compatibility and deployment remain unverified. No real issue, PR or deployment was created by this build.
