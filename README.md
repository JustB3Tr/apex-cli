# APEX CLI

An open-source collaborative coding agent for your terminal. Work with other developers and their agents, keep project context across chats, and maintain a local Markdown vault that opens in Obsidian. Each developer brings their own model access, including supported free tiers or local models.

Run `apex` inside a project. No browser or HTTP service starts by default. Encrypted collaboration rooms, optional account backups, plugin/MCP catalogs and remote control are explicitly configured features. MIT licensed; no central paid API key is bundled.

## Install

Source: [JustB3Tr/apex-cli](https://github.com/JustB3Tr/apex-cli), branch `master`. Registry release is pending npm authentication. You can install the current GitHub source now:

```powershell
npm install --global github:JustB3Tr/apex-cli#master
apex
```

For a downloaded local tarball:

```powershell
npm install -g ./apex-agent-cli-0.8.0.tgz
apex C:\projects\my-app
```

Once published, installation will be `npm install -g apex-agent-cli`, then `apex`. The existing npm package `apex` belongs to someone else; it is not this CLI. Registry publication still requires npm login. See [PUBLISHING.md](PUBLISHING.md) for first release and token-free GitHub Actions setup.

## Guided first setup

Start `apex PATH`, then `/setup`. Choose your own provider or local server, an exact model, prices when needed, and a per-turn ceiling. The guide saves Plan mode and asks separately before its optional first model request. A local setup saves a $0 ceiling. `/collaborate` gives one two-person workflow. See [ONBOARDING.md](ONBOARDING.md) and [COLLABORATION.md](COLLABORATION.md).

## Safer long chats and saved backups

`/context inspect` explains whole-turn context selection and interrupted-tool notices. `/room status` shows hub storage limits. Account backups now support explicit encrypted export, verified deletion/pruning and offline restore; see [ACCOUNTS.md](ACCOUNTS.md). No automatic pruning or hosted service is enabled.

## Configure models

Node22+ is required. Use `/login openrouter` to save a key on Windows, set `OPENROUTER_API_KEY` in the terminal environment, or run a local Ollama model. No key is bundled or imported from another project.

```powershell
apex --model ollama:your-model
apex --model openrouter:deepseek/deepseek-v4.1-flash-1017
apex -p "Explain this project" --model ollama:your-model
apex --continue
```

Use `apex --help` for the full command list. `/model`, `/models`, `/new`, `/sessions`, `/resume`, `/history`, `/usage`, `/project`, `/memory`, `/mcp`, `/team`, `/agents`, `/terminal`, `/shell` and `/multiline` work inside the terminal.

### Providers

Built-in providers share the APEX tool loop, Plan/Build controls, chats and approval prompts. Use a model that supports function calls. Provider model catalogs may also include embedding, audio or other models that cannot run this coding-agent loop. Most adapters use Chat Completions. Native Anthropic Messages, OpenAI Responses and Gemini Generate Content adapters are also available; OpenCode selects the API family from its live model catalog. Provider-native hosted tools are outside this harness's client tool loop. xAI currently uses its legacy Chat Completions compatibility API.

### Free access, saved context and motion

`/free` explains local models and supported user-owned free API plans. `/free models` discovers live zero-price OpenRouter text/tool models; `/free use openrouter:EXACT_ID:free` enables free-only routing with no paid fallback. Gemini and Groq require explicit confirmation of your own free account plan because APEX cannot enforce their billing tiers. Details and current official sources: [FREE_MODELS.md](FREE_MODELS.md).

`/vault init` creates the compatible local vault and celebrates only after setup succeeds. `/motion full|reduced|off` controls the activity and completion effects. `/account backup` and opt-in autosync save supported chats, memory and Markdown to your own invite-only service with client-side encryption. Sponsorship stays disabled at $0. No public APEX cloud is deployed by this package. Setup and scope: [ACCOUNTS.md](ACCOUNTS.md).

| Provider ID | Key environment variable | Connection |
| --- | --- | --- |
| `openrouter` | `OPENROUTER_API_KEY` | OpenRouter |
| `openai` | `OPENAI_API_KEY` | Direct OpenAI API |
| `anthropic` | `ANTHROPIC_API_KEY` | Direct Anthropic Messages API |
| `deepseek` | `DEEPSEEK_API_KEY` | Direct DeepSeek API |
| `gemini` | `GEMINI_API_KEY` | Gemini OpenAI-compatible API |
| `groq` | `GROQ_API_KEY` | Groq |
| `together` | `TOGETHER_API_KEY` | Together AI |
| `fireworks` | `FIREWORKS_API_KEY` | Fireworks AI |
| `mistral` | `MISTRAL_API_KEY` | Mistral |
| `xai` | `XAI_API_KEY` | xAI |
| `zen` | `OPENCODE_API_KEY` | OpenCode Console (formerly Zen) |
| `baidu` | `QIANFAN_API_KEY` | Baidu Qianfan V2 |
| `dashscope` | `DASHSCOPE_API_KEY` | Alibaba Cloud, workspace endpoint required |
| `moonshot` | `MOONSHOT_API_KEY` | Moonshot / Kimi |
| `zai` | `ZAI_API_KEY` | Z.AI / GLM standard API |
| `minimax` | `MINIMAX_API_KEY` | MiniMax standard API |
| `siliconflow` | `SILICONFLOW_API_KEY` | SiliconFlow |
| `cerebras` | `CEREBRAS_API_KEY` | Cerebras |
| `ollama` | None | Local port 11434 |
| `lmstudio` | None | Local port 1234 |
| `llamacpp` | Optional `LLAMACPP_API_KEY` | Running llama.cpp server, port 8080 |
| `vllm` | Optional `VLLM_API_KEY` | Running vLLM server, port 8000 |

`/providers` shows configured endpoints and whether a key is saved or available in the environment. `/login groq` (or another API provider ID) stores that provider's key through the hidden prompt. `/models groq` queries its catalog; `/model groq:EXACT_MODEL_ID` selects one. Model IDs are discovered or supplied explicitly rather than guessed. No existing dataset-generation credential is imported into APEX, and no new provider is used for dataset generation by adding it here.

`/provider add company https://inference.example.com/v1 COMPANY_API_KEY` adds an OpenAI-compatible endpoint. Append `anthropic`, `responses` or `google` for those native API formats; the default is `openai-compatible`. `/login company` stores its separate key; `/model company:MODEL_ID` selects it. The URL must use HTTPS remotely and cannot embed credentials or query strings. HTTP is accepted only on loopback. `/provider remove company` preserves its saved key; log out before removal if you want that key erased. Built-in providers cannot be shadowed or removed.

`/endpoint PROVIDER HTTPS_BASE_URL` saves an account/region-specific endpoint for either a built-in or custom provider. Provider-specific `PROVIDER_BASE_URL` environment variables take precedence. Ollama's override can omit `/v1`. Alibaba requires the workspace/region URL displayed in your account, such as `https://YOUR_WORKSPACE.us-east-1.maas.aliyuncs.com/compatible-mode/v1`; APEX intentionally has no guessed workspace default. Baidu uses a Qianfan V2 API key, not the older AK/SK or access-token workflow. These integrations do not register accounts or purchase a service.

For local inference, start your server separately, then use `/models ollama`, `/models llamacpp`, `/models vllm`, or `/models lmstudio`, followed by `/model PROVIDER:EXACT_MODEL_ID`. API keys are optional for llama.cpp/vLLM; `/login llamacpp` and `/login vllm` save one if your server requires it. APEX does not download/load models or start servers simply because a provider is listed. Remote endpoint overrides are no longer assumed to be free local inference.

OpenCode's current endpoint root is `https://opencode.ai/inference`. `/login zen`, `/models zen`, then `/model zen:EXACT_MODEL_ID` use its live catalog, endpoint metadata and machine-readable prices. Native routes are validated against the configured OpenCode origin/path before sending a key. Reasoning output items and Gemini signatures are replayed only to their original provider/model. Restricted zero-price models and non-chat models are excluded from APEX's list: OpenCode documents that its free-tier chat endpoints reject third-party clients. Use your own paid or eligible subscription key; APEX does not impersonate OpenCode to access those routes.

OpenRouter and OpenCode supply machine-readable model prices. OpenCode estimates use the highest listed token tiers, including cache-write/long-context tiers, to avoid under-reserving. For other APIs, configure current provider prices with `/pricing provider:MODEL_ID INPUT_USD_PER_M OUTPUT_USD_PER_M`. These are operator-supplied estimates, never reported as actual billed cost. Paid requests without known prices stop before sending, unless the operator explicitly opts into `APEX_ALLOW_UNPRICED=1`. The per-turn ceiling uses conservative byte/token estimates and configured rates; it is not an account-wide billing guarantee. APIs usually report token counts without dollar cost, so APEX shows unknown actual cost and a separate estimate ceiling. OpenCode's BYOK estimates remain estimates rather than actual billed dollar totals. Catalog discovery never issues a paid inference request, and failed inference requests are not automatically retried or routed to another account.

Additional primary references: [OpenCode inference](https://opencode.ai/v2/docs/console/api/inference/), [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [Baidu Qianfan SDK](https://github.com/baidubce/bce-qianfan-sdk/blob/main/docs/inference.md), [Alibaba workspace endpoints](https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope), [Moonshot](https://platform.kimi.ai/docs/get-your-api-key), [Z.AI](https://docs.z.ai/guides/overview/quick-start), [MiniMax](https://platform.minimax.io/docs/api-reference/text-openai-api), [SiliconFlow](https://docs.siliconflow.com/en/api-reference/chat-completions/chat-completions), [Cerebras](https://inference-docs.cerebras.ai/resources/openai).

Provider protocol references checked October 30, 2026: [OpenAI](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [Anthropic](https://platform.claude.com/docs/en/api/messages), [DeepSeek](https://api-docs.deepseek.com/), [Groq](https://console.groq.com/docs/openai), [Together](https://docs.together.ai/docs/inference/openai-compatibility), [Gemini](https://ai.google.dev/gemini-api/docs/openai), [Fireworks](https://docs.fireworks.ai/api-reference/post-chatcompletions), [Mistral](https://docs.mistral.ai/api), [xAI](https://docs.x.ai/developers/model-capabilities/legacy/chat-completions), [LM Studio](https://lmstudio.ai/docs/developer).

## Agent workflow

`/plan` and `/build` switch modes; Shift+Tab switches while composing without losing your draft. `apex --mode plan` starts read-only. The selected mode is saved for the next launch. Plan mode advertises only project reads, directory listing and status tools. The runtime also rejects attempted writes, shell calls, memory proposals, delegation and MCP execution even if the model invents a forbidden call. Build mode retains per-action approvals. Mode changes do not execute or automatically submit your draft.

Read-only project tools are scoped to the selected project. File edits, model shell commands, proposed memory notes, delegation and external MCP actions require terminal approval. Inspect exact arguments, then type `y` to allow. One-shot mode denies these actions unless explicitly started with `--approve`. Approved shells and MCP servers run as your user and are not OS sandboxes.

The orchestrator can propose up to three parallel workers with disjoint file scopes. Workers read a shared `.apex/teams/<id>/TASKS.md` and inspect peer progress through `team_status`. Recursive delegation is disabled. Human approval is required before launching a model-proposed team. Workers use separate Git worktrees and share one job ledger. Per-agent model choices are supported, and independent review precedes explicit integration. This is an application budget estimate, not an account-wide provider billing lock.

Saved chats, projects, MCP configuration and editable memory live in `~/.apex-cli` or `APEX_HOME`. `--home` selects another state directory. Memory is explicit notes, not perfect hidden recall. Selected memory and file contents may be sent to your configured model. Credentials for MCP use environment variable names, not secret values in config.

Examples:

```text
/memory add Use TypeScript and preserve existing APIs
/mcp add {"name":"tools","type":"stdio","command":"my-mcp-server","args":[]}
/mcp connect <server-id>
/team Implement the parser and tests with separate owners
/terminal new tests
/terminal send tests npm test
/multiline
```

End multiline input with `.end`. Esc or Ctrl+C cancels the active turn; `/exit` saves and closes managed shells. `/shell` attaches an ordinary foreground shell; type `exit` to return.

## Terminal appearance

The ANUS terminal presentation is adapted with an APEX gradient block logo, purple welcome text, a large rounded input bar, Build/Plan status, star-prefixed replies, an elapsed working indicator, and a project/model footer. Up/down recall commands; left/right, Home/End, Ctrl+A/E, Ctrl+U/K/W edit the prompt. Long typed input scrolls horizontally. Bracketed multiline pastes collapse to `[Pasted N lines #id]`; the complete original text, tabs and line breaks are restored when you submit. Delete the placeholder to remove the whole paste. Your terminal must support bracketed paste; `/multiline` remains available otherwise. Background shell output redraws the prompt without losing your draft.

Color follows your terminal; `NO_COLOR=1` disables decoration. The footer reports cumulative provider-reported tokens and cost when available. Context remaining is omitted because the runtime does not measure it. This renderer keeps terminal scrollback and does not require an alternate screen. Source attribution and license texts are included in `NOTICE` and `licenses/`.

## Login and saved API keys

`/login codex` and `/login claude` hand the terminal to the installed official CLI's sign-in flow. You complete the provider's browser authentication yourself. APEX never reads, copies or implements those subscription OAuth tokens. `/codex [request]` and `/claude [request]` open the official CLI inside your project; exit it to return to APEX. These are explicit native handoffs, not subscription tokens reused as arbitrary APIs. Native CLIs own their permissions, MCP, history and billing; their usage does not enter APEX's token totals. Plan requests select the native read-only sandbox or Plan mode, but APEX's tool allowlist does not govern the external program. Installation of these optional CLIs is separate.

`/login PROVIDER` opens a hidden key prompt for any configured API provider. Enter saves; Esc cancels. Windows DPAPI encrypts each key for the current Windows account in `~/.apex-cli/credentials.enc.json`, outside project chats and memory. Keys never appear in terminal history or process arguments. No plaintext fallback exists. On other OSes use environment variables; saved-key vault support is currently Windows only. Environment keys take precedence. `/auth` reports presence without values, and `/logout PROVIDER` removes only the APEX copy; it cannot revoke a provider key or unset a parent-shell environment variable.

Saved API keys authenticate APEX's tool loop directly for their matching provider. `/login openai` now saves only the APEX key. Separately, `/login codex-api` explicitly pipes the saved OpenAI key to `codex login --with-api-key`; this changes that CLI's login when you invoke the command. A saved Anthropic key is also supplied to explicit Claude handoffs through its environment. `/logout codex` or `/logout claude` invokes the official CLI's logout and can affect other apps sharing that login. APEX does not launch logins or paid inference merely on startup.

Official references: [Codex authentication](https://learn.chatgpt.com/docs/auth), [Claude Code authentication](https://code.claude.com/docs/en/authentication).

In the source checkout, terminal captures from the actual APEX process are saved in `artifacts/apex-build.png` and `artifacts/apex-plan-paste.png`. With development dependencies installed, `node scripts/capture-terminal.mjs` records ConPTY output into an xterm screen buffer and renders its cells to PNG; it also tests hidden entry with a fake credential. These are terminal buffer captures, not desktop window photographs. The recorder currently uses Windows and Consolas fonts. Screenshots, recorder and development dependencies are excluded from the installed CLI package.

## Evidence and limits

`npm test` checks CLI parsing and actual one-shot child processes with an offline mock provider, including permission denial/approval and real file writes. `node server/runtime/selftest.mjs` checks persistence, tools, cancellation, parallel teams, path ownership and a real local MCP stdio handshake/call. No paid model calls were made to validate this build.

Provider-reported token counts and actual costs are shown; unknown cost remains unknown. Current response display is completion-level, not true token streaming. Background terminals use pipe mode; full-screen programs belong in `/shell` or another terminal. MCP HTTP client exists but remote OAuth is untested. This initial release is not complete feature parity with Claude Code or Codex. No affiliation is implied.

## Collaboration and Obsidian vault

Version 0.5 adds encrypted group chats, peer-owned approved inference, source synchronization through Git, isolated team branches, shared job budgets, durable workers, evidence-backed memory and linked local Markdown vaults. The independently authored Obsidian plugin opens shared notes and saves local outbox drafts. It does not fork Obsidian or enable plugins automatically.

Start with `/vault init`, `/vault plugin` and `/board`. Read [COLLABORATION.md](COLLABORATION.md) for the complete multi-machine setup, group/context controls, costs, privacy boundaries and exact commands. Normal APEX startup remains terminal-only; `apex hub` is an explicitly started optional transport.

## MCP marketplace, plugins, skills and remote control

Version 0.6 includes a working bundled project MCP server, a curated integration catalog and live official MCP Registry discovery. It adds Claude-layout plugin marketplaces, installed skill/command snapshots, namespaced invocation and progressive skill loading. Plugin declarations never grant tool permissions or automatically execute hooks.

Use `/mcp browse`, `/plugin browse` and `/skills`. The optional `/remote` controller supports browser/phone and CLI access to a selected local session, with pairing, viewer/controller roles, finite budgets and explicit approval policy. Normal startup remains terminal-only. See [EXTENSIONS.md](EXTENSIONS.md) for setup, supported plugin formats, remote HTTPS requirements and verified/unverified boundaries.


### Cache visibility and efficient workflows

`/cache` shows the last request's provider-reported cache token counts and available window estimates. `/cache on|off` controls the live footer countdown. Unsupported TTLs remain unknown, and elapsed estimates never claim the server has evicted the cache. No paid keepalives, cache-retention upgrades or third-party agent bundles are enabled by this feature. Research, provider differences and recommended integration priorities: [EFFICIENCY.md](EFFICIENCY.md).
