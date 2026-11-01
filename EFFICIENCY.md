# Agent libraries, context efficiency and cache visibility

## APEX 0.13 context recovery

`/recover` chooses the next turn's context strategy without making a model call. Actual history trimming or an elapsed previously observed cache-window estimate opens an interactive choice before POST: reread saved history if it fits, recover selected vault notes and their local links, keep recent context, or cancel. Cache expiry is not memory loss. Unknown cache policy remains unknown, and no keepalive is sent.

Recovery tools are read-only and private/shared scoped. The instructions tell agents to cite vault notes and graph records, inspect relevant links, verify current files and ask when missing information matters. Selective recovery can miss facts; loading every note is neither required nor assumed cheaper. Full original transcripts remain saved, and bounded private checkpoints retain original message references without claiming a semantic summary or execution proof. Existing turn/job ceilings still apply.

Research checked October 30, 2026. These are integration candidates, not installed dependencies or demonstrated APEX quality improvements.

| Project | Useful part for APEX | Tradeoff |
| --- | --- | --- |
| [wshobson/agents](https://github.com/wshobson/agents) | Likely the remembered large plugin collection: 202 specialist agent definitions, plus skills and commands | Role prompts are not additional trained models; use a selected specialist rather than inject every role |
| [VoltAgent subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) | 161+ role definitions, grouped into installable categories | Select a small relevant set; extra workers add their own input/output cost |
| [Agency Agents](https://github.com/msitarzewski/agency-agents) | Broad role catalog and cross-harness formats, including engineering and reviewers | Personality and long process templates are not proof of better task outcomes |
| [Context Mode](https://github.com/mksglu/context-mode) | Keep raw tool results outside the prompt; search indexed evidence and retrieve relevant snippets | Claimed reductions concern particular context workloads. Its hooks need explicit harness support; MCP execution is still permission-gated |
| [RTK](https://github.com/rtk-ai/rtk) | Compact Git/build/test/search output while retaining raw evidence | Choose the Apache-2.0 **rtk-oss** edition for an open-source dependency; the current full/proxy editions include BUSL components. Output reduction is not the same percentage off the total bill |
| [Superpowers](https://github.com/obra/superpowers) | Debugging, explicit acceptance criteria, verification and review workflows | Full planning/delegation can be excessive for a tiny change; apply workflows proportionately |

The APEX plugin loader currently supports its documented subset of Claude-layout skills, commands and MCP selections. It does not automatically turn third-party `agents/` profiles or Claude hooks into native APEX workers. No repositories above were installed, copied into the system prompt or given automatic shell access in this change.

## Recommended order

1. Small, task-selected specialist profiles and a verification step with concrete success criteria. Don't treat a library of 200 roles as 200 extra models or launch them all.
2. Bounded tool outputs with complete raw evidence preserved outside the prompt, searchable on demand. Keep failures and relevant diagnostics; don't compress away the bug.
3. Stable system/tool prefixes with changing memory and retrieved data placed later where the provider protocol allows it. Loading/unloading tools and constantly rewriting system context can spoil prefix reuse.
4. Per-model reasoning/output controls and a budget for repeated failed attempts. A universal 'think less' sentence cannot enforce hidden reasoning budgets. Some tasks need more reasoning, and aggressively low budgets can damage quality.
5. Measure completed tasks, correctness, elapsed time, actual input/output/reasoning/cache tokens and reported billing. Token savings, cache discounts and quality are separate metrics. No claimed percentage improvement is accepted as an APEX benchmark result.

## What the cache display actually does

`/cache` reads the current model's last locally saved main-agent observation. It displays reported cache reads/writes, the request-start time, observation time, hashed route/prefix identifiers and any justified window estimates. `/cache on` enables a footer countdown; `/cache off` hides it. The UI refreshes locally, preserves the editing cursor/draft and makes no API request.

Counts are normalized from OpenAI/OpenRouter cache details, Claude read/write fields, DeepSeek hit fields and Gemini cached-content fields. A missing counter stays unknown instead of becoming zero. 'No hit/write reported' is different from 'server cache definitely cold.' Ordinary cached input still consumes context capacity; caching mainly avoids repeated prefix processing and may discount billing. It does not remember text that the client omitted from the request.

The countdown is based on the **last request**, not a promise that the next request's prefix or route will match. Changing models, credentials, tools, system prompts, context layout, serving hosts or provider policy may invalidate reuse. Route/prefix hashes contain no prompt text or raw credential. An elapsed window says 'estimated window elapsed', not 'evicted'. Existing unsupported providers show 'expiry unknown'.

### Provider differences

- [Claude API](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): default minimum is 5 minutes; 1 hour is also available. Time starts at the start of a writing/reading request, not when its answer finishes. APEX shows split write windows if the provider reports them. For a native Claude read with unknown segment TTL, it uses the conservative 5-minute minimum rather than restarting a guessed one-hour window. Longer cache writes can cost more. This change does **not** enable explicit Claude caching or request one-hour writes.
- [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching): current GPT-5.6+ documentation specifies a default 30-minute minimum and optional 12-hour writes, while older model families use different retention behavior. APEX shows the modern direct-API default only after reported cache activity; older/unknown policies stay unknown. Default modern cache writes cost 1.25 times base input, so the conservative request estimate now allows for that surcharge. No extended retention is requested.
- [DeepSeek](https://api-docs.deepseek.com/guides/kv_cache/): automatic best-effort disk cache, usually retained for hours to days, without a precise promised TTL. APEX displays observed hits and unknown expiry, not an invented five-minute countdown.
- [OpenRouter](https://openrouter.ai/docs/guides/best-practices/prompt-caching): caching depends on the selected model/host. APEX sends an opaque stable session identifier for the existing conversation/worker/model to aid documented sticky routing, without pinning a paid fallback. Reported cache counters are shown; no host-independent TTL is invented.
- [Gemini](https://ai.google.dev/gemini-api/docs/caching): cached-content usage is displayed when reported. No explicit paid cache object or storage lifecycle is created by this feature.

No keepalive, prewarm, background inference, extended-TTL purchase, provider switch or extra model request is part of the timer. Fixture tests and an actual terminal capture verify display behavior; live provider cache hit rates and savings have not been benchmarked.
