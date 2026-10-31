# Model access without an APEX-funded bill

APEX's core is collaborative development with saved context and a local, Obsidian-compatible Markdown vault. Each developer supplies their own model access. No central paid key is bundled, no API request is silently moved to a paid model, and optional sponsorship remains disabled at $0.

## Options checked October 30, 2026

| Access | What is free | Practical limit |
| --- | --- | --- |
| Local Ollama, llama.cpp, LM Studio, vLLM | No provider inference fee | Your hardware, electricity and model license still apply |
| [OpenRouter](https://openrouter.ai/docs/api_reference/limits) | Zero-price `:free` variants | Own key, limited free requests, availability and host privacy policies |
| [Gemini](https://ai.google.dev/gemini-api/docs/pricing) | Selected models on a Free-tier project | Own key; a billed project can charge; free content may improve Google products |
| [Groq](https://console.groq.com/docs/billing-faqs) | Own Free-plan usage | Per-model request/token limits; Developer-tier billing is separate |

APEX discovers OpenRouter models live and includes only text/tool models whose input and output prices are both zero. A model name containing `free` is insufficient. It checks again before each turn in free-only mode. Other paid catalog entries remain available for ordinary BYOK use outside that mode. OpenCode's restricted zero-price routes are not exposed to third-party clients.

```text
/free
/login openrouter
/free models
/free use openrouter:EXACT_MODEL_ID:free
/free limits
```

`/free limits` makes a read-only request using your key and displays available quota fields, without model inference or the full account response. Missing fields mean unknown. One coding task may make multiple model requests for tools. A 429 stops the turn, preserves progress and asks you to wait; there is no key cycling or paid fallback.

For Gemini, select `gemini:gemini-2.5-flash-lite` or `gemini:gemini-2.5-flash` from your available catalog. For Groq, use a tool-capable model available on your Free plan. `/free use` asks you to confirm your account/model is actually free. APEX cannot enforce or inspect those providers' billing tiers, and changing that tier later can create charges. The displayed $0 estimate for these routes reflects your confirmation, not a provider billing guarantee. `/free off` explicitly leaves this mode.

For local use, first start your existing model server, then use `/free models ollama` and `/free use ollama:MODEL`. Selecting a model does not download or install it. No account or provider key is needed for an unauthenticated loopback server.

## Terminal motion

```text
/motion full
/motion reduced
/motion off
/vault init
```

Full motion animates the activity glyph while showing the actual model/tool phase and elapsed time. A short starburst ends in `Vault ready` only after vault creation and project configuration both succeed. Escape skips the completion effect. Reduced motion uses static completion with a slower activity refresh; off disables animation timers. `APEX_REDUCED_MOTION=1` selects reduced motion by default, and `TERM=dumb` disables effects. No fake progress percentage or invented reasoning-effort indicator is shown.
