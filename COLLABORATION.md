# Shared projects, personal agents and a local vault

APEX 0.8.0 is a terminal CLI. Collaboration uses a separately started headless hub. The vault is ordinary Markdown and works with Obsidian or a text editor. This is an independently authored integration using Obsidian's plugin API, not a fork of Obsidian's proprietary desktop app.

For a guided start, run `/setup`, then `/collaborate`. The two-profile source rehearsal is `npm run verify:collaboration`; it uses fake inference, real Git/tests and separate credentials. See [ONBOARDING.md](ONBOARDING.md) for exact evidence limits.

## First local project

```text
apex C:\projects\your-project
/build
/vault init
/vault note {"title":"Project decisions","content":"Use the existing public APIs. Validate changes with the project tests.","kind":"decision","visibility":"shared"}
/vault search public APIs
/vault plugin
```

`/vault init PATH` selects a different vault. Open the reported folder in Obsidian and enable **APEX Vault** under Community plugins yourself. Installation does not enable plugins, alter other settings, fork or install Obsidian. The plugin opens Home and shared notes, and saves draft requests to `Outbox/`. Run `/vault import` to import drafts as private notes. Drafts are preserved and duplicate imports are suppressed.

Generated notes have stable IDs, frontmatter and wikilinks. A modified generated note is preserved; an incoming version is saved beside it. There is no Dataview requirement. Home and chat MOCs link the notes. Private, shared and combined model context use bounded excerpts with citations rather than including the entire vault. Keyword retrieval is local; it is not a claim of perfect semantic recall. Saved memory can include file hashes, commit and expiry; stale facts are labelled. Neither notes nor peer messages can authorize tools.

New vaults have a local `.gitignore` excluding their contents. Git carries source files, while explicitly shared context travels through encrypted room events. Private notes and outbox drafts stay local. Back up a vault separately by explicit choice. Do not assume deletion of a local note removes copies already shared with other members.

## Source on multiple machines

Each machine uses its own Git login/credential helper. Use a repository you control:

```text
/repo init
/repo connect owner/repository
/repo push Initial project save
```

On another machine, start APEX in an unrelated empty folder, then:

```text
/repo clone {"remote":"owner/repository","destination":"C:/projects/shared-project"}
/repo status
/repo sync
```

`/repo save MESSAGE` commits locally. `/repo push MESSAGE` saves then pushes. `/repo sync` fetches and fast-forwards only a clean checkout. Dirty or diverged work is preserved and reported. No force push, reset, conflict resolution or submodule execution is automatic. Save uses your configured Git author identity, with APEX as the fallback when none is set. Explicitly opt into a terminal-session watch with `/repo watch 60`; `/repo watch off` stops it. Any conflict/error stops the watch. Source synchronization is Git, not simultaneous character-level editing. Git authentication and repository visibility remain your responsibility.

`/project-copy DESTINATION` copies bounded files without credentials, vault data or symlinks. Different existing files are preserved and incoming versions get conflict filenames. Files above 2 MB are excluded from automatic copy/save; use deliberate Git/file operations for larger assets.

## Group connection

On the computer hosting a local test:

```powershell
apex hub --home C:\Users\brady\.apex-hub --port 8789
```

The hub prints its endpoint and the path of its owner bootstrap token. The token itself is not printed. In APEX:

```text
/room create http://127.0.0.1:8789
```

Enter the hub owner token at the hidden prompt. Creating/joining a room configures a local `APEX-Vault` automatically if no vault was selected. `/room invite member` displays a private, single-use invitation after confirmation. Send it yourself to the intended person. That person runs `/room join` and pastes it at the hidden prompt. `viewer` invitations can read but cannot publish. The development assistant does not send invitations to anyone.

For different physical computers, use a reachable HTTPS endpoint. Start the hub with `--host`, `--cert` and `--key` using a certificate trusted by each client. Non-loopback HTTP is rejected. Hosting, DNS, certificates and firewall setup are not provisioned automatically. Do not disable certificate verification. APEX does not offer a hosted relay in this build.

```text
/room members
/room say Here is the decision I want to share.
/room tell MEMBER_ID Please review the parser interface.
/room pull
/room watch 10
/context combined
```

`/room pull` receives shared events and writes linked notes locally. `/room watch 10` enables periodic pulls in this terminal session; `off` stops them. Agents have a local `peer_inbox` tool and an approval-gated `peer_message` tool. Receiving text never executes it. `/context private` uses private local history/notes; `shared` excludes private history and memory; `combined` includes local context plus published room messages. Selecting combined context does not upload private context. `/share publish` separately confirms publishing all user/assistant text in the selected chat. `/share export FILE` creates a portable file; `/share import FILE` imports untrusted text without tool-call execution.

The hub stores token hashes and authenticated encrypted message payloads, plus routing metadata such as member IDs, roles, times and audience. Room tokens/keys are protected by Windows CurrentUser DPAPI outside project files. Invitations carry the room key and grant history access, so keep them private. Revocation blocks future hub access; it cannot erase already downloaded notes, and this beta does not rotate the room key automatically. Saved room membership currently requires Windows; other operating systems need a future secure-store adapter. Room encryption is not an independent security audit.

## Storage and context inspection

`/room status` reports room and hub usage. Hub GET polling no longer writes storage. New growth stops transactionally at the published limits while existing events and cursors remain intact. Default limits are 100 rooms per hub, 64 member records, 256 invitation records and 10,000 events per room, 16MiB per room and 64MiB per hub, measured as serialized state. Revocation/leaving and existing reads remain available at capacity. Export/archive the hub locally or move to a separate hub deliberately; no automatic history deletion occurs. The backend still reads a full document and rewrites on mutations.

`/context inspect` shows complete historical turns included/omitted and missing tool receipts marked unknown. Original chats remain saved. A missing receipt can mean an action ran before interruption; inspect actual files and `/timeline` before proposing a repeat. The harness never executes old calls merely because they appear in history. This is bounded deterministic selection, not a semantic-summary or memory guarantee.

## Pooling accounts without copying keys

Each person retains their own provider key. Work is offered to a specific member and runs only after that owner opts in and accepts it:

```text
/pool on openrouter:YOUR_MODEL 0.50
/pool inbox
/pool offer {"target":"MEMBER_ID","goal":"Inspect the parser and explain the likely bug.","maxUSD":0.05}
/pool accept TASK_ID
/pool off
```

The first allowance is the owner's total local pool budget. The offer is a bounded task allowance. Configure provider prices normally. The accepting machine performs inference with its own key and a separate saved session using shared-only context. Peer-owned work runs in Plan mode, with interactive execution approvals denied. Project read tools remain available. Accept only tasks whose access to the selected project is appropriate. No provider fallback or another key is used to replay an ambiguous request. Peers' cost reports are labelled peer-reported; only the executing owner has the local request ledger. These estimates are not an account-wide provider billing lock.

`/pool cancel TASK_ID` cancels an offered task. It is not a guarantee of interrupting already billed work. The accepting owner can cancel a running job using `/job cancel JOB_ID`. If connectivity fails after acceptance or the worker is interrupted, inspect the job and reservations; do not accept the task again. Old reservations remain held until explicitly reconciled. Do not raise the allowance to work around uncertainty.

## Durable jobs, teams and evidence

```text
/job new {"goal":"Inspect the parser","model":"ollama:YOUR_MODEL","mode":"plan","maxUSD":0}
/job start JOB_ID
/job show JOB_ID
/board
/timeline JOB_ID
```

A detached worker survives terminal closure and persists progress. Its interactive writes, shell and MCP approvals are denied by default. `/job cancel` signals a running worker through saved state. `/job resume` explicitly queues an interrupted/failed job after billing uncertainty is resolved, and `/job start` launches it. Completed jobs are not resumed. `/job reconcile REQUEST_ID ACTUAL_USD` records an actual known charge. Never guess a charge merely to clear a hold. An interrupted worker may repeat work since its recorded progress; zero possible progress loss is not promised.

Model-proposed teams require approval and a clean committed Git checkout. Workers get separate Git worktrees, disjoint write scopes, per-agent model assignments and one shared job ledger. An independent read-only model turn reviews their diffs. `/agents` lists branches; `/integrate AGENT_BRANCH` explicitly merges one. No integration occurs just because a worker says it finished. Approved shell commands are not OS sandboxes and may escape file scopes. `/timeline` distinguishes actual command exit/output receipts from model claims and reviewer opinions.

`/checkpoint LABEL` bookmarks clean committed Git state; `/rewind CHECKPOINT_ID` creates a new restoration branch and leaves existing branches intact. Local edits block restoration. `/pack inspect FILE` validates a version-1 MCP pack; `/pack install FILE` saves its configurations without starting servers. `/eval {"file":"case.json","expected":"...","jobId":"..."}` exports selected evidence. `trainingCandidate:true` labels an optional candidate, never admits it to training automatically. No model-training or dataset-generation pipeline is changed by these features.

## Verification and remaining setup

Automated fixtures cover three independent local profiles, encrypted HTTP transport, three actual Git checkouts, conflicts, branch isolation, pool authorization, private context, Windows DPAPI, a real local MCP process, detached workers, terminal commands and Obsidian API behavior. The integrated demo uses fixture inference with zero paid requests. These checks do not prove real provider account compatibility, a public internet deployment, a second physical PC or actual Obsidian desktop loading. Those are the next deployment checks.

The package is locally installable as `apex-agent-cli`, with command `apex`. Public npm publication still requires the publisher's npm authentication. No public package, cloud host, invite, account purchase or provider spending is created by development tests.
