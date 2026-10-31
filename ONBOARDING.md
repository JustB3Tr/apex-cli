# First project and first collaborator

Start `apex PATH`, then enter `/setup`. The guide shows local servers and your own provider accounts, asks before a catalog lookup, accepts an exact model ID, and records a price estimate when needed. Saved API keys use Windows CurrentUser DPAPI. Other operating systems must use provider environment variables; there is no plaintext saved-key fallback.

The final confirmation selects Plan, the model, and a per-turn ceiling. A local setup saves a $0 ceiling. To use a paid model in that profile, run `/setup` again and choose its ceiling. `APEX_MAX_TURN_USD` can further lower the limit and defaults to $1. Jobs and remote hosts also enforce their own allowances. Reservations are conservative estimates, not an account-wide billing guarantee. Unknown outcomes remain held for reconciliation.

Setup installs no model and buys no credits. Catalog access is a read-only request to the selected endpoint. The optional final Plan check is a separate model request requiring its own confirmation. Catalog metadata and operator prices do not prove tool compatibility. Provider-reported costs remain distinct from estimates; malformed or missing token counts stay unknown.

Use `/collaborate` for one two-person sequence. Hosting, invitations, Git, consent and revocation are documented in [COLLABORATION.md](COLLABORATION.md). Each person keeps their own credential, checkout, private history and vault. A peer agent runs only after its owner opts in and accepts a bounded task. Combined context does not upload private chats.

From an APEX source checkout:

```text
npm test
npm run verify:collaboration
npm run verify:terminal
```

The rehearsal creates two disposable profiles, two real Git checkouts and a separate peer process. It verifies encrypted loopback events, separate fake keys, owner consent, a Plan file-read/tool-result exchange, private-context exclusion, executable code tests in both checkouts and linked Markdown notes. No real inference provider is called. This does not prove a physical second PC, real-model quality, public TLS hosting or Obsidian desktop loading.

Remote control is optional. An unacknowledged browser submission retains its exact message, mode and request ID locally. Reload reconciles host state; explicit retry reuses that ID. POST requests never replay automatically. A record from another host/session/device cannot be replayed in a new scope. Inspect host jobs and billing before dismissing it. Recovery temporarily stores the pending prompt in browser storage, not an API key; use a trusted browser profile.

Long chats use complete bounded historical turns. `/context inspect` explains omissions and interrupted tool notices; it does not delete original chat history. `/account storage` and the explicit export/prune/offline-restore commands are documented in ACCOUNTS.md.
