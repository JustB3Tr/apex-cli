# Contributing to APEX

Use Node 22 or newer. Run `npm ci`, `npm test` and `node server/runtime/selftest.mjs`. Actual browser tests require cached isolated Chromium; terminal capture requires Windows ConPTY. Missing prerequisites must fail visibly. Do not silently download a browser or substitute a personal browser.

Use fixture inference and disposable profiles. Keep model access, keys, approvals, project scope, context and billing separate. Do not embed keys, use live accounts in tests or invent charges to clear holds. Test real tool/result exchanges, cancelled/invalid responses, multiple OS processes, canonical paths and interrupted state. Plugin lifecycle belongs to a project. Pass untrusted output through `terminalText`; trusted ANSI is only for the application's own renderer after sanitizing dynamic text.

Collaboration evidence should cover both profiles, owner acceptance, private-context exclusion, source synchronization and executable tests. Model opinions are separate from test receipts. Name what was not verified, including real providers, public TLS, physical devices, operating systems and model quality.

Before release, inspect `npm pack --json --ignore-scripts`, compare packaged source hashes, unpack and execute it, and exclude homes, credentials and artifacts. Public publication or hosting requires a separately authorized release and intended account. A local tarball does not prove npm registry availability.
