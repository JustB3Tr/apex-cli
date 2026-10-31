# MCPs, plugins, skills and remote control

APEX 0.6 keeps the terminal as its main interface. The browser UI is an optional remote controller for one selected local session. No web listener, package download, plugin hook, login or model inference starts just because you launch APEX normally.

## Working MCP integrations

```text
/build
/mcp browse
/mcp inspect apex-project
/mcp install apex-project
/mcp
/mcp connect SERVER_ID
```

The bundled **APEX project** MCP server is a real stdio server. It exposes bounded project read/list/search, Git status, shared-vault retrieval, a project context resource and a review prompt. Private paths and secrets are excluded. It has no shell or write tools. It runs from the installed APEX package, so this integration needs no separate npm download or service account.

Curated recipes include the MCP reference Filesystem, Memory and Sequential Thinking packages, Microsoft's Playwright MCP, Upstash Context7 and GitHub's official hosted MCP server. Packages are pinned to versions inspected during this build. The reference packages currently require Node 24; APEX itself supports Node 22+. Playwright uses an isolated browser context, not your personal browser profile. Its browser executable may need separate installation/configuration. APEX does not install browser binaries automatically.

`/mcp install` saves a reviewed configuration. `/mcp connect` is a separate approval that may start third-party code, download the pinned npm package or contact the hosted service. Package execution uses the current user's account, not an OS sandbox. `npx --ignore-scripts` prevents npm lifecycle scripts, not the server's own code from running. Inspect source, publisher, permissions and licensing before connecting a third-party server.

```text
/mcp search context7
/mcp inspect io.github.upstash/context7
/mcp install io.github.upstash/context7
/mcp auth SERVER_ID
/mcp resources SERVER_ID
/mcp read SERVER_ID apex://project/context
/mcp prompts SERVER_ID
/mcp get-prompt SERVER_ID review-project
/mcp disable SERVER_ID
/mcp enable SERVER_ID
```

Registry search uses the official public MCP Registry and preserves publisher/version metadata. A registry listing is not a safety endorsement. Automatic recipes support streamable HTTP and straightforward pinned npm stdio packages. Unsupported package arguments, transports and custom header schemes require explicit manual configuration. Remote HTTP requires TLS outside loopback.

Credentials and declared environment values can be entered at `/mcp auth` hidden prompts. They use Windows CurrentUser DPAPI outside the project. Environment variables take precedence. Configurations contain names, not keys; known saved keys are redacted from tool/resource/prompt results. GitHub uses your own `GITHUB_TOKEN`, Context7 your own `CONTEXT7_API_KEY` when required. OAuth sign-in flows and every external service/account have not been independently validated. Installing a recipe is not proof that an account is connected. Removal keeps historical encrypted credential evidence; it does not revoke a service token.

Project-bound servers cannot advertise tools to another selected project. External tool calls and resource/prompt operations still require approval. Disabling or uninstalling an extension disconnects its active servers when the runtime synchronizes; it never turns a plugin's declared permissions into automatic approval.

## Plugin marketplace

```text
/plugin browse
/plugin inspect apex-dev@apex-official
/plugin install apex-dev@apex-official
/plugin list
/plugin disable apex-dev@apex-official
/plugin enable apex-dev@apex-official
/plugin uninstall apex-dev@apex-official
```

The bundled `apex-official` marketplace includes original development and frontend workflows. Browsing registers it locally. You can add a marketplace from a local directory or a Git repository:

```text
/plugin marketplace add owner/repository
/plugin marketplace add C:/tools/my-marketplace
/plugin marketplace list
/plugin marketplace update MARKETPLACE_NAME
/plugin marketplace remove MARKETPLACE_NAME
```

The layout follows Claude Code conventions: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `skills/`, `commands/` and `.mcp.json`. Supported plugin sources are relative folders, GitHub repositories, Git URLs and Git subdirectories. Git `ref` and full SHA pins are honored. Marketplace manifests and installed files have hashes; Git sources record the actual checked-out commit. Inspection creates a bounded frozen preview. Confirmation installs a separate snapshot so changing the source after review cannot silently change the installed workflow.

Plugin installation is project-scoped. Namespaces such as `apex-dev:review-code` prevent accidental built-in command overrides. Updates require an explicit marketplace refresh and reinstall. Existing snapshots remain preserved on uninstall/replacement for evidence; uninstall removes registration and its MCP configurations. Symlinks, traversal, credential files, oversized bundles, mismatched names and modified installed files are rejected. If you intentionally edit an installed plugin, reinstall explicitly to establish a new snapshot.

Compatibility is deliberately limited to supported components. Hooks, monitors, LSP servers, agents, plugin settings and dependency installers do not execute. Unsupported manifest components are shown in the review. `allowed-tools` does not grant permissions. Command/archive/npm marketplace source types and packaged MCP bundles are not automatically executed or extracted. This is Claude-layout support, not a claim that every Claude plugin works unchanged.

## Skills and commands

```text
/skills
/skills show apex-dev:review-code
/apex-dev:review-code parser edge cases
/apex-dev:debug failing cancellation
/skill apex-frontend:frontend-build improve the settings panel
/skills install C:/tools/my-skill
/skills disable user:my-skill
/skills enable user:my-skill
```

Skills are discovered in `~/.apex-cli/skills/`, the selected project's `.apex/skills/` and `.claude/skills/`, and enabled plugin snapshots. A skill directory contains `SKILL.md` with YAML `name` and `description`. It can include supporting files. Names use lowercase letters, digits and hyphens. Project skills get `project:` and personal skills `user:` prefixes. Duplicate namespaces are errors.

Metadata is bounded in the model context; complete instructions load only when selected/read. APEX defaults skills to explicit invocation unless `disable-model-invocation: false` is set. Explicit slash invocation substitutes `$ARGUMENTS`. Supporting resources remain inside the skill root and have text/size limits. Shell injection syntax inside Markdown stays literal text. Scripts, subagent declarations and tool pre-approvals never run automatically. All selected workflow text remains below the user's task and the runtime's permission rules. Plan mode stays read-only even when a skill asks to execute something.

## Remote control from a browser/phone

Select a model and chat on the host, then:

```text
/build
/remote on {"maxUSD":0.10,"maxSessionUSD":1.00,"allowApprovals":false}
```

This explicitly starts a loopback listener and prints a private pairing link that expires after five minutes. The code works once. A paired controller can see the selected chat, submit tasks and cancel them. With the default policy, actions requiring approval are denied. To approve individual actions from your remote device, explicitly start with `allowApprovals:true`; the controller shows the exact tool and arguments and requires an Allow/Deny action. Approval is per action, not a blanket shell permission. Approved shell tools still run as your OS user and are not sandboxed.

The per-turn and total session allowances are finite application budgets, with billed/held usage retained. Unknown paid outcomes stay reserved. They are estimates, not a provider invoice guarantee. A controller cannot raise the host's budget or change its configured model through the HTTP API. Local model sessions can use zero-dollar limits.

```text
/remote code viewer
/remote devices
/remote revoke DEVICE_ID
/remote off
```

Viewer devices can read but cannot submit, cancel or approve. Revocation blocks further access and cancels a current task belonging to that device. Stopping the host revokes its devices. Restarted hosts require pairing again; interrupted requests are marked for inspection and are never replayed automatically. Request IDs prevent duplicate turn submission. A persisted lease stops another local terminal/controller from running the same conversation concurrently.

For a different physical machine or phone, configure a reachable HTTPS address and a certificate trusted by the client. There is no hosted relay, automatic tunnel or account subscription:

```powershell
apex remote host --folder C:\projects\my-project --model ollama:MODEL --budget 0 `
  --host 0.0.0.0 --port 8790 --cert C:\tls\cert.pem --key C:\tls\key.pem `
  --url https://my-pc.example:8790
```

Use `--session ID` to select an existing saved chat, `--total-budget USD` for a larger explicitly bounded session allowance, and `--allow-approvals` only when you want remote per-action approvals. Network/TLS/firewall setup is user-provided. The PC must remain on. Non-loopback HTTP and certificate-verification bypasses are not supported.

Pairing links grant access to the selected conversation. Keep them private. Tokens are hashed on the host; browser sessions use HttpOnly SameSite cookies with CSRF checks. The page has a restrictive CSP and renders model output as text. Pairing has rate limits, devices expire, and cross-origin requests are rejected. This is not an independent penetration-test certification.

## Remote CLI

From another APEX installation:

```text
/remote pair https://my-pc.example:8790
/remote status https://my-pc.example:8790
/remote send https://my-pc.example:8790 {"message":"Inspect the parser","mode":"plan"}
/remote approve https://my-pc.example:8790 APPROVAL_ID
/remote deny https://my-pc.example:8790 APPROVAL_ID
/remote cancel https://my-pc.example:8790
```

The global equivalents are `apex remote pair|status|send|approve|deny|cancel URL ...`. Pairing uses hidden terminal input. Saved CLI device credentials currently require Windows DPAPI; browser controllers work on other platforms. Keep the printed request ID after a network error. Inspect host status before retrying and reuse the exact same ID/content if needed. APEX does not automatically replay a prompt when a connection fails.

## Verification

Automated checks use fixture inference and isolated temporary projects. They cover a real bundled MCP stdio server, tools/resources/prompts, credential redaction, plugin snapshots/lifecycle, explicit workflow inclusion, HTTP remote pairing/roles/approvals/revocation, cancellation holds and cross-runtime session exclusion. The actual Playwright MCP server also drove an isolated cached Chromium through pairing, submitting a task and explicitly approving a verified host file write at 1100px and 390px widths, with no horizontal overflow. That is viewport testing, not a physical-phone or public-internet deployment claim. No personal browser, provider funds, model weights or training data were changed by these checks.

Primary format references: [official MCP Registry API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md), [Claude plugin manifests](https://code.claude.com/docs/en/plugins-reference), [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces), [skills](https://code.claude.com/docs/en/skills), [Playwright MCP](https://github.com/microsoft/playwright-mcp), [GitHub MCP](https://github.com/github/github-mcp-server).
