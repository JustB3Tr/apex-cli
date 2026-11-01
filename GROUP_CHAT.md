# Shared chats and personal agents

APEX has a live shared chat, alongside each person's private agent chats. Ordinary text in the group goes to people. A message **beginning with `@apex`** calls one opted-in agent owner. A quoted mention, an imported transcript or an assistant's reply does not launch another agent.

Open `/group` to join the group tab and start sync for this terminal. Switch with `/tabs`, Ctrl+G, or click the chat bar. `/tabs personal` returns to your private agent. Each tab keeps separate drafts and input history. Personal history is not broadcast. `/group pull` explicitly imports bounded shared references into the selected personal chat.

## Connect people

Use the existing explicit hub workflow in [COLLABORATION.md](COLLABORATION.md): start a hub you control, `/room create URL`, then `/room invite` and `/room join` on each colleague's computer. Invitations are private credentials. Off-machine hosting requires reachable networking and TLS; opening a group does not deploy a public server or punch a tunnel through your network.

Rooms support up to 64 members, including groups of 3-10. This release tests ten independent profiles on one loopback hub and three simultaneous agent owners. That is not a production load test or proof of a hosted multi-machine deployment.

## Pool usage without sharing keys

`/group pool` guides each owner through:

- Their provider/model, using their own saved key or local endpoint.
- A total allowance and a per-turn ceiling, both finite and explicit. Zero works with a local model.
- Plan or Build permissions, and whether other group agents may run concurrently.
- For Build, explicit nonoverlapping file/directory scopes.

The pool is a set of owner-funded allowances, not a joint account or a transfer of API keys. Any active room member can request work within these allowances while the owner's APEX terminal is online. Each turn is bound to one owner before execution; there is no silent fallback to another key/provider. The group shows owner-reported usage, active reservations and remaining limits. Provider invoices can differ from estimates.

`/group target MEMBER_ID` selects an owner. `/group target auto` chooses an online, opted-in owner with sufficient advertised allowance, favoring the least committed allowance. The final atomic cap check happens on the owner's computer. A full turn ceiling is reserved before work; the existing request ledger enforces every provider request. Unknown billing remains held and stops that owner's group processing until inspected. `/group off` stops accepting new calls without discarding active work or old receipts.

Explicit configuration is also available:

```text
/group pool {"enabled":true,"model":"ollama:YOUR_MODEL","mode":"plan","maxUSD":0,"turnUSD":0,"multiAgent":true}
```

Keys remain in each owner's credential store. Do not paste them into shared chat. Shared references never grant spending, shell or MCP permission.

## Concurrent work in one project

Every owner may enable their own group agent, while also using their personal agent. There is one active group turn per owner. With concurrency opted in by the involved owners, agents work simultaneously; the group displays owners, goals, file scopes, model, state, branch and baseline. Plan agents inspect and answer. Build agents get separate Git worktrees with explicit ownership scopes. Worktrees require a clean committed repository; Build agents must share the same baseline commit. Overlapping path ownership is rejected, including case-only overlaps.

For example, Alice owns `src/login` and Bob owns `src/checkout`. Both can run while a third person reviews the group timeline. `team_status` lets agents inspect locally synchronized colleagues. Group agents cannot access private memory, load plugins, start nested teams or publish arbitrary peer messages through tools. File writes are scope checked and approved locally. Shells require explicit local approval and are **not an OS sandbox**; an approved shell can escape file ownership.

Separate PCs do not share a physical filesystem. Use the connected Git repository for branch exchange/merges, or reviewed small source snapshots:

```text
/group changes publish
/group changes
/group apply CHANGE_ID
```

Publishing previews exact owned public file versions and requires confirmation. Applying lets you select the project checkout or your idle agent worktree, then previews the incoming files and requires Build mode, no active local agent work, matching Git baseline and unchanged destination contents. Existing identical files are skipped. Local conflicts, secret-looking text, private paths, symlink escapes, stale previews, binary/oversized files and destructive deletions are refused. Import executes no code, creates no commit and retains a local backup receipt. Small snapshots are limited to 30 files/60KB overall and 50KB per text file; use Git for bigger or destructive changes. Multi-file filesystem writes are not an OS transaction: an interrupted apply preserves its backup/partial-write receipt for inspection.

## Steer work while it runs

Keep typing in a personal tab to steer its active agent. In the group, use `@apex` again with the same selected owner to steer your active request, or `/group steer TURN_ID TEXT` for an exact turn. Ordinary group discussion does not steer agents automatically.

The requester and the agent owner may steer that turn. Other members cannot hijack it. The current HTTP request/tool completes first; completed tool receipts are retained and the new direction enters the next model request. A response that arrives while steering is pending is retained before the follow-up request. Steering does not replay a request or grant new permissions. Normal turn/tool/budget limits still apply; a direction received at the final limit may need an explicit new turn.

Esc with an empty composer or Ctrl+C cancels selected work. An interrupted process leaves a durable claim and conservative reservation. No turn is automatically restarted after a crash. Inspect `/job show JOB_ID`, reconcile actual charges with `/job reconcile REQUEST_ID USD`, then `/group resolve TURN_ID` to release verified holds without replaying that turn.

Only explicitly shared messages, answers, selected references and approved source snapshots are sent to the room. Room text and model output are untrusted. The encrypted hub still knows membership and traffic metadata; encryption is not a substitute for choosing trustworthy collaborators.
