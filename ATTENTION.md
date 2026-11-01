# Durable human review

`/attention` groups questions from parked jobs. A model clarification and a proposed action awaiting batch review become durable question records with exact versions, hashes, source fingerprints, owner identity, and expiry. Waiting work uses no further inference until you explicitly continue it. Answers are task direction, never permission to execute a tool.

Use `/attention policy immediate` for normal live approvals or `/attention policy batch` to park selected proposed actions for later review. `/attention` opens the review menu; `/attention list` prints the briefing without a model call. Choose **Answer this version** to inspect the question, its context, and any proposed operation. Saving an answer leaves the job in `waiting_human`.

`/attention resume ID` is a separate host action with a budget/mode preview. Every waiting question for that job must have a current answer. The worker must have exited, the source/expiry must still match, and unresolved reserved/sent/unknown provider outcomes block continuation. The original job budget remains in force. Ordinary tool permissions apply again after continuation. A reviewed write does not become an approved write merely because you answered its question.

If source changes or an answer needs revision, use `/attention refresh ID`. This creates a new version, retains the previous version/hash/answer, refreshes its source fingerprint, and requires a new answer. Old previews cannot answer or continue the new version. A source change discovered after explicit continuation parks the job again instead of quietly proceeding.

Source fingerprints include the bounded public project/worktree source and Git HEAD/branch, not file contents in the question display. Credential/private paths and known generated directories are excluded. Fingerprinting rejects symlinks and oversized sources: at most 2000 files, 2 MB per file, and 24 MB total. This is a conservative freshness check, not a complete filesystem snapshot, audit of dependencies, or guarantee that every relevant external fact is unchanged.

## Remote answering

Remote answers are disabled by default. The host must explicitly set `allowAttention:true` when starting `/remote on`, or pass `--allow-attention` to `apex remote host`, alongside the existing selected session/model and finite budgets. A paired controller can then view and answer questions only from that selected project/session. This opt-in includes private questions in that session; only enable it for a device trusted to read that chat. Viewers receive an empty question inbox and cannot submit answers.

The companion page provides an expandable exact preview with context, proposed operation, version, hash, source status, visibility, and expiry. Question/context content is rendered as text. A stale source disables its answer button and the server independently rejects stale source/version/hash submissions. Source-root machine paths are omitted from list and answer responses. The page cannot refresh or resume attention work. It saves an answer for the host's explicit review/continuation only. Remote tool approvals remain a separate host capability, disabled by default.

Remote pairing, controller role, origin checks, CSRF, selected-session filtering, source freshness, and exact version/hash checks all still apply. An active remote turn must finish or park before its question can be answered through the endpoint. Repeating the same answer is idempotent; changing an existing answer requires a fresh question version. An answer is not a payment authorization, budget increase, deployment approval, or queued model request.

This feature remains local/host owned. There is no autonomous schedule that wakes parked jobs, no guarantee that a disconnected PC is reachable, and no automatic replay of ambiguous paid work. Team/group and experiment jobs retain their own lifecycle and permission rules. A question in one private chat is not automatically published to a room or another chat.

## Evidence and limits

`tests/attention.test.js` covers core parking/continuation. `tests/remote-attention.test.js` exercises the real loopback HTTP server for opt-in, viewer denial, private project/session isolation, stale versions/source, CSRF, idempotent answers, preserved budgets, and no implicit continuation/tool execution. `node scripts/verify-attention-browser.mjs` uses an already installed isolated Chromium, writes mobile/desktop screenshots and a receipt under `artifacts`, and never installs a browser or contacts a model. This proves the browser fixture, not a physical phone, public TLS deployment, internet reachability, or third-party inference behavior.

Provider API-key storage now has separate macOS Keychain/Linux Secret Service adapters, validated through injected fixtures. Native macOS/Linux keychain checks have not run on this Windows host. Generic encrypted account/room documents still require DPAPI; see [credential constraints](CREDENTIAL_STORAGE.md). Human review does not bypass those platform limits.
