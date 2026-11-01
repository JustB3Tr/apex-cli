# Reproduction, comparison and confined trials

These commands build reviewable evidence. They do not establish general correctness, model superiority or production safety.

## Share a failing case

Run a command with `!`, keep its completed failure receipt, then open `/repro`. Capture selects that receipt, a clean Git revision and up to thirty public UTF-8 fixture files. The portable case contains the selected command, exit observation, fixture hashes and a small observed environment label. It does not include the entire project, private chat, credentials or dependencies.

The receiving person imports the JSON without executing it. Their checkout must have the same clean committed revision. `/repro` previews a replay plan and asks separately before executing the exact command in a fresh Git worktree. The original checkout is preserved. Replays retain their worktree and process receipt, including exit status and elapsed time. A matching failing exit is labelled as such, not proof that two environments failed for the same reason.

Host command replay **is not an OS sandbox**. It can access the host or network if its approved command does so. Provider-secret environment variables are withheld from child processes, but that does not prevent an approved host process from reading files. Use confined trials for untrusted fixture code.

Explicit forms:

```text
/repro capture {"title":"Checkout fails","shellId":"RECEIPT_ID","files":["tests/checkout.test.js"]}
/repro import C:/path/to/case.json
/repro plan CASE_RECORD_ID
/repro run PLAN_RECORD_ID
/repro export {"id":"CASE_RECORD_ID","file":"C:/new/case.json"}
```

Exports create new files and refuse overwrites. Execution plans are immutable and single-use. Source drift, altered previews and already-started plans require inspection rather than blind replay.

## Compare two approaches

`/compare` creates two isolated worktree branches from one clean commit, with one exact acceptance command. Each approach declares its instructions, model, scope and finite cap; their caps cannot exceed the experiment's total. Creating the comparison does not start either model.

Run one implementation at a time through an explicit plan and approval, or edit its worktree separately. APEX uses the existing runtime, action approvals and durable request ledger. An implementation attempt cannot be silently replayed. Run the same selected acceptance check independently on each approach. The comparison shows actual patches, source fingerprints, process evidence, measured model usage and unknown/held charges. If source changes after a check, its result becomes stale. A check that itself changes source is also not treated as current stable evidence.

Choose an approach explicitly. Choosing records the human decision and performs no merge, deployment or deletion. Matching command/base and OS/Node labels do not prove dependency parity or fair model-quality benchmarking.

```text
/compare new {"title":"Parser choices","acceptance":"npm test -- parser","totalUSD":0,"alternatives":[{"label":"A","instructions":"Minimal fix","model":"ollama:MODEL","scope":["src/parser.ts"],"maxUSD":0},{"label":"B","instructions":"Explicit parser state","model":"ollama:MODEL","scope":["src/parser.ts"],"maxUSD":0}]}
/compare plan {"id":"COMPARISON_ID","alternativeId":"APPROACH_ID","kind":"check"}
/compare run PLAN_ID
/compare show COMPARISON_ID
```

## Disposable operation and extension trials

`/rehearse` and `/extension-trial` use an actual Docker boundary. They require a running **Linux** Docker engine and an **already local immutable `sha256:` image ID** with `/bin/sh` and the required tools. APEX never pulls/builds an image, installs Docker, starts a service or forwards credentials in these commands. Select fixture files explicitly. Only those public text files enter a retained staging folder; the project directory, Docker socket and credential stores are not mounted.

The approved argv executes in a temporary container workspace copied from read-only `/input`. Controls include no network, read-only root filesystem, all Linux capabilities dropped, no new privileges, a non-root user, separate/disabled IPC, bounded processes, memory, CPU, output and runtime. APEX inspects the created container before starting it and refuses control or mount drift. It removes only its uniquely named container afterwards, preserving plan/result and selected staging inputs. Failed cleanup remains visible.

```text
/extension-trial plan {"image":"sha256:FULL_LOCAL_IMAGE_ID","files":["probe.mjs"],"argv":["node","probe.mjs"],"timeoutMs":10000}
/extension-trial run PLAN_ID
/rehearse results
```

For an MCP/plugin, use an explicitly selected fixture entrypoint and data inside a suitable local image. This does not automatically install marketplace code, copy its real configuration, attach private tools or grant its declared permissions. Output from a probe remains untrusted. Independently inspected Docker controls establish the boundary used for that run; they are not a complete syscall trace, malware verdict, proof of all possible attempted access, or a guarantee that the extension behaves identically with real data.

Container OS isolation is separate from the earlier collaboration rehearsal and host worktrees. Docker unavailability fails closed. Fixture-driver contract tests are separate from real Docker execution evidence, which must be recorded for the current host/image.

Docker flag reference: [Docker container run](https://docs.docker.com/reference/cli/docker/container/run/) and [Docker Engine security](https://docs.docker.com/engine/security/). The local image's code and embedded contents remain the owner's responsibility; image identity is not trust certification.
