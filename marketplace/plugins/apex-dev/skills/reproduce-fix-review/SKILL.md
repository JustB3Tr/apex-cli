---
name: reproduce-fix-review
description: Reproduce one concrete defect, implement a bounded fix and preserve before/after evidence.
disable-model-invocation: true
---
Inspect the reported behavior, relevant files and project instructions. Read relevant vault citations when older context is absent; verify them against current files. Establish a concrete reproduction before claiming a defect. Agree the smallest useful scope and file ownership. In Build request normal approvals, preserve user changes and implement the fix. Run meaningful checks; preserve actual exit codes/output. Explain what passed, what failed, and what was not exercised. Use a selected /receipt only with human review. Do not launch additional agents/models, install tools, publish code or increase budgets implicitly. Reference the recipe contract's exact version when recording an outcome.
