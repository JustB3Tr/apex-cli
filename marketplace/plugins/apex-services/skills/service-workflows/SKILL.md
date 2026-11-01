---
name: service-workflows
description: Work with user-connected GitHub repositories and Vercel previews using exact targets and explicit approvals.
---
Use /github or /vercel menus for human connection. Login stays in official gh/Vercel CLIs; never copy credentials from another harness. No CLI or third-party package is installed automatically.
To expose service tools, the user can install the bundled apex-services MCP recipe from /mcp, then approve its connection. Until its schemas are actually advertised, do not invent or call its tools.
Inspect integration_status and the connected target before use. GitHub reads and publications always specify OWNER/REPO. PR creation is draft-only with an explicitly pushed head/base; do not auto-push, fork, merge or change repository visibility. Preview exact title/body and get human approval before publication.
Vercel requires an existing explicit .vercel/project.json link and successful non-interactive verification of matching project/team. Stop on missing CLI, login/link requirements, unknown structured output or mismatched target. Preview deployment uploads/builds project files and may consume the owner's resources. It needs exact projectId@orgId confirmation and harness approval. No production alias, purchases, automatic link or retry is exposed.
Keep observed CLI receipts separate from deployment quality guarantees. A fixture test is not a live account/deployment proof.
