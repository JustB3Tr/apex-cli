---
name: review-code
description: Reviews code changes for concrete correctness, regression and permission failures, citing inspected files and evidence.
disable-model-invocation: true
---
# Review code

Inspect the requested change and relevant callers before drawing conclusions. Identify concrete failures with file citations and a reproducible trigger. Distinguish model opinions, static inspection, executed tests and actual deployed behavior. Report the most consequential findings first; do not invent findings to fill a quota. Preserve unrelated edits and never grant yourself tool permissions.

Focus requested by the user: $ARGUMENTS

Use [CHECKLIST.md](CHECKLIST.md) only when additional review structure helps.
