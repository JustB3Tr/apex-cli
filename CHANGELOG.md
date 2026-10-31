# Changes

## 0.8.0

- First clean GitHub runner exposed Windows short-path/canonical-path mismatches in Git saves and plugin skills. Root aliases are now normalized before containment comparisons, with a regression test.


- Whole-turn model context with explicit interrupted-tool unknown results, orphan/invalid-exchange handling, bounded history selection and `/context inspect`. Original transcripts remain intact.
- Read-only hub GET polling, transactional aggregate/count limits and `/room status`; existing history is preserved at capacity.
- Encrypted backup exports, confirmed verified delete/prune, offline password restore, retryable deletion tombstones and exact-byte orphan-upload recovery. No automatic pruning.
- Compatibility checks and additional protocol, quota, interruption, filesystem and offline-recovery regressions.

The document backend, semantic summaries, token streaming and broader release validation remain separate work.

## 0.7.2

- Guided `/setup` for provider/model/prices, Plan mode and a per-turn ceiling; `/collaborate` and a two-profile rehearsal.
- Transactional credential saves across processes; atomic lock-owner publication, ownerless-lock recovery and Windows rename retries.
- Terminal control-sequence containment, consistent private reads, metadata-only memory freshness, safe Git status and clean-tree pushes.
- Project-scoped plugin lifecycle and associated MCP configuration.
- Exact unpriced opt-in, validated reply/tool shapes, normalized token accounting, bounded JSON reads and preserved billing uncertainty.
- Browser same-ID submission recovery, GET-only reconnect and stable approval focus; remote help and vault-index filtering corrected.
- Current runtime, onboarding and contributor documentation, plus regression/browser/terminal/collaboration evidence.

Production scale/retention, full conversation compaction, token streaming and the broader release matrix remain open. No public npm publication or hosted service is implied.
