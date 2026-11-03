# APEX accounts and saved context

New APEX releases are source-available under the APEX CLI Source-Available Use License. Users may run the unmodified CLI, but may not reuse, modify, or redistribute its source. This is not an open-source license. Developers bring their own model access. Collaboration, persistent project context and the local Markdown vault work without an APEX account or sponsored model service. Obsidian is an optional compatible reader/editor, not an open-source app fork bundled into APEX.

Accounts are an optional invite-only, self-hosted beta. This build does not deploy a public APEX cloud, sell subscriptions or supply API credits. Both sponsorship caps default to **$0**. A zero cap rejects inference before reading a sponsor key or making an upstream request.

## Run your own account service

```powershell
apex cloud serve --home C:\apex-account-service --port 9460
```

In another terminal, create one private invitation:

```powershell
apex cloud invite --home C:\apex-account-service
apex signup http://127.0.0.1:9460
```

Email, master password and invitation are entered through hidden prompts. Use a separate service directory, not your personal APEX profile. Remote service connections require HTTPS, a certificate/key and a configured public URL. No ports, domain, tunnel or hosting account are provisioned automatically. Never expose an invitation in a public README or project repository.

## Save and restore

Inside APEX:

```text
/account status
/account backup
/account backups
/account autosync on
/account usage
/account sessions
```

On another Windows PC, log into the same service with the same email and master password. Then explicitly select a destination:

```text
/account login https://YOUR_ACCOUNT_SERVICE
/account restore {"path":"C:/projects/apex-restored"}
```

Snapshots contain supported chats, explicit memory, project metadata, selected safe preferences, Markdown skills and vault notes, including your **Private notes**. They are encrypted client-side with AES-256-GCM. A scrypt derivation separates the authentication proof from the backup key; the master password and backup key never go to the service. Local account secrets use Windows CurrentUser DPAPI. Provider credentials, replay state, model weights, active jobs and arbitrary project source files are excluded. Secret-pattern filtering is supplemental and cannot detect every secret someone manually types into a note.

Versions are immutable within a 20MiB per-account service allowance, with 50 active versions and a 10,000-record metadata ceiling by default. Explicit deletion retains an ID tombstone to prevent stale retries from resurrecting it. Local snapshot limits also apply. Backups do not automatically prune earlier versions. Restore preserves edited Markdown as incoming versions, uses deterministic chat IDs and never installs executable plugin/skill assets or connects MCP servers. Source files remain Git-managed. Saved extension selections are a receipt for later explicit setup, not an automatic installer.

Auto-backup is opt-in, runs every 60 seconds while this CLI is open, skips unchanged content and pauses on errors. Switching accounts disables it. `/account logout` removes local account keys and attempts server-session revocation; it reports whether revocation succeeded. `/account revoke SESSION_ID` invalidates another login. Password reset, email verification, SSO and public-scale operations are not implemented. Losing the master password means losing access to encrypted backups.

## Export, retention and offline restore

These commands require the 0.8.0 self-hosted account service. Updating the CLI does not restart any running service. Normal backup downloads remain compatible with the older response format.

```text
/account storage
/account export {"id":"BACKUP_ID","file":"C:/backups/project.apex-backup.json"}
/account delete {"id":"BACKUP_ID","export":"C:/backups/project.apex-backup.json"}
/account prune {"keep":3,"exportDirectory":"C:/backups/apex"}
/account restore-file {"file":"C:/backups/project.apex-backup.json","path":"C:/projects/recovered"}
```

Create the parent folder for an individual export first. Exports are encrypted portable archives, reread and authenticated locally. Existing different files are preserved. They include account/email/service identity, hashes and ciphertext; API tokens, authentication proofs, master passwords and sync keys are excluded. Keep the master password. It is required for offline restore, even if the service is gone.

Delete and prune require Build mode, matching local archives and confirmation of exact remote IDs. Every selected version is exported before pruning asks for confirmation. Archives are checked again after confirmation; a missing or changed copy blocks deletion. Prune keeps at least one newest version, processes at most 50 older versions per explicit batch, and never runs automatically. Cancellation may leave the requested export files, while preserving all remote versions.

A deletion failure keeps its quota held and exposes pending IDs in storage status. Retry the explicit delete command with its verified archive; do not edit the service ledger to pretend space was freed. Tombstones prevent stale upload retries from restoring deleted IDs. Complete interrupted uploads are adopted only if the immutable ID/device and bytes match. Conflicting/corrupt evidence is preserved for inspection.

Restore-file works without service access or login. It asks for the hidden master password and an explicit destination, then uses the same conflict-preserving restore path. Wrong passwords fail before destination files are created. Restored project paths are reported; select one deliberately with /project. No background service or provider call is started by restore.

## Optional sponsorship

Leave it disabled for a BYOK product. If an operator later chooses to fund it, the service accepts explicit monthly and per-user daily caps plus a dedicated `APEX_SPONSOR_OPENAI_API_KEY` on the server. That is ordinary paid API usage funded by the operator, not a free OpenAI API.

The optional route pins GPT-6 Luna with no reasoning, bounded text/function tools, at most 2048 output tokens and conservative atomic cost reservations. Unknown send/read outcomes remain held and are not replayed. Caps are conservative application accounting, not a guarantee of future provider invoices or unchanged prices. Existing personal keys and dataset-generation balances are never imported. Positive-budget tests use fixtures only.
