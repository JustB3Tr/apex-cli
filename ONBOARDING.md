# First project and first collaborator

Start `apex PATH`. First launch opens a centered terminal popup wizard, using the existing theme. Choose an existing vault, create a new one, or skip it. Next, optionally configure one or more providers and a default model, then choose permissions. `/setup` reopens the wizard; Escape backs out without deleting completed choices. Users upgrading from the older text setup see this new wizard once.

Provider and model lists support search, arrows, Enter and mouse selection. Choosing a provider loads only its model catalog; setup never sends inference or buys credits. Saved API keys use hidden input and Windows CurrentUser DPAPI. Other platforms use provider environment variables. A provider confirmation saves its model and per-turn ceiling, and selects Plan until the wizard's final permission choice. Local models use a $0 ceiling. Paid models require catalog prices or explicitly entered operator estimates. The last configured model is the default; other saved credentials are retained.

`APEX_MAX_TURN_USD` can further lower the ceiling and defaults to $1. Jobs and remote hosts have their own allowances. Estimates and unknown outcomes remain distinct from provider-reported charges. Setup does not guarantee model tool compatibility or provide an OS sandbox. Declining a vault prevents collaboration from silently creating one; existing vaults are preserved.

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

## Command picker and permissions

Type `/` in the main composer for matching commands. Continue typing to filter; arrows select, Tab completes, and Enter completes a partial command or submits an exact one. Escape dismisses the menu. Secret and confirmation prompts have no command suggestions. Multiline pastes stay collapsed and preserve their content.

The bottom-left bar shows Plan/Build and effective permissions. Ctrl+P cycles Ask, Auto, and read-only; `/permissions ask|auto|read-only` selects directly. Shift+Tab still switches Plan/Build. Selecting Ask or Auto explicitly enters Build; read-only enters enforced Plan. `/build` leaves read-only using Ask, rather than silently restoring Auto.

Auto uses a local rule set, not model self-approval: bounded project source/text writes may proceed, and exact `pwd` (plus `Get-Location` and `Get-Date` on Windows) may execute. Private paths, dot directories, dependency manifests, agent instruction files, unknown file types, escaping paths, other shell commands, MCP calls, delegation, memory changes and peer messages still ask. Auto decisions are recorded locally. This is not an OS sandbox, filesystem isolation, or protection from a separate program running under your account.

## Local shell mode

Type `!command` and Enter to run a user command in the current project. Windows uses PowerShell without profiles; other platforms use `/bin/sh`. These are explicit user actions even while the model is in Plan. Pasted shell commands need an extra execution confirmation. Escape clears an unsubmitted shell command; Escape/Ctrl+C cancels a running command.

Typing `!` changes the composer marker from `>` to `!` and shows SHELL/local execution. The prefix is not duplicated in command text. Home/left keep the cursor inside the command, and Backspace at its start exits shell mode while preserving the text. Paste/history retain shell mode and its execution confirmation; no command runs just because the marker changed.

Each completed command saves a local receipt with command, stdout, stderr, exit code, duration and timeout/cancellation/truncation flags. Execution is limited to 30 seconds and 200KB captured output; reaching either limit stops the owned process tree/group. Common credential patterns and secret environment values are redacted, but review output for sensitive information before sharing it. Redaction cannot recognize every possible secret.

APEX then asks before sending the receipt to the selected model, using its existing turn ceiling. Declining keeps it out of model chat history and future model context. `/commands` lists the last 20 project receipts, `/commands ID` inspects one, and `/commands send ID` asks to share one later. A missing model preserves the receipt for later use. Commands are not replayed automatically. Interactive `/shell` and managed `/terminal` sessions remain separate and do not produce these receipts.

## Model, effort and expanded menus

`/model` opens provider selection followed by a searchable model list for that provider. If a model is absent from the catalog, type its exact ID. `/model PROVIDER:MODEL` still selects directly. Catalog metadata is saved with its observation time; missing context sizes and prices display as unknown.

`/effort` opens a menu; `/effort auto|low|medium|high|xhigh|max` selects directly. Auto leaves the provider default unchanged. Effort is saved and applied on later turns. OpenRouter reasoning controls are sent only when the model catalog advertises the parameter; Responses-compatible routes use `reasoning.effort`. Other routes receive prompt guidance, and the dashboard labels this as prompt-only. Model-specific acceptance remains provider dependent, and rejection is never automatically replayed. Effort does not raise the 4096-token response limit, tool-turn limit or spending cap. Native effort field references: [OpenRouter parameters](https://github.com/OpenRouterTeam/docs/blob/main/api_reference/parameters.mdx), [OpenAI reasoning guide](https://developers.openai.com/api/docs/guides/reasoning).

At 110 columns by 32 rows or larger, the composer shows cumulative session input/output usage, latest request-plus-reply tokens versus catalog context capacity, estimated token prices, effort, automatic history-trim thresholds and MCP states. This uses terminal dimensions, not OS fullscreen detection. Unknown usage/cost/context stays unknown. Latest request usage is not an exact count of the next prompt. When catalog context is known, the runtime also trims whole old turns near an approximate 80% input threshold, estimated from UTF-8 bytes divided by four. The independent 40-history-message and 500KB bounds still apply. This is rolling history selection, not a model-generated summary; original chats and tool receipts remain saved. A mandatory current turn that exceeds the bound fails before another model request.

Click an MCP server row or press F4 for its configuration popup. `/mcp` opens the same list at any size. Active means connected; inactive means configured but disconnected, and disabled means explicitly turned off. Menus support configuration inspection, enable/disable, approved connection, hidden credential entry, removal confirmation and curated marketplace configuration. Browsing does not start servers. Plan blocks changing/connecting integrations. Expand/shrink the terminal to show/hide the dashboard; Escape returns from menus and restores unsent composer text. Mouse reporting works with SGR-capable terminals; F4 and arrow/Enter navigation remain available.
