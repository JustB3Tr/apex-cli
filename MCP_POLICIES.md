# Exact MCP permission grants

APEX keeps per-invocation approval as the default. `/mcp-policy` opens a local interactive menu for a narrow, temporary exception. `/mcp-policy list` inspects the current project’s metadata and `/mcp-policy revoke GRANT_ID` revokes a saved grant.

The menu selects one currently advertised tool from an already connected server, accepts a hidden JSON argument object, previews the exact scope and asks for an explicit confirmation. It offers at most 60 minutes and ten invocations. There are no wildcard arguments, path templates, inferred grants, model-created grants or automatic server connections. Non-interactive approval flags cannot create a grant through this command.

Each allowance binds the project ID, external tool ID, server configuration/route identity hash, canonical advertised input-schema hash and canonical exact argument hash. Changing any of those requires normal approval or another human-reviewed grant. Canonical JSON sorts object keys but preserves array ordering, string case and value types. Unsupported/non-JSON values and oversized arguments fail closed. A tool changing during menu review cannot inherit the earlier confirmation.

The saved `mcp-permissions.json` contains only IDs, hashes, timestamps and use counts. Argument values and schemas are not stored there or printed in creation receipts. The preview remains transient. A server’s identity hash must be supplied by the runtime from its actual configured identity, not accepted from a model’s requested arguments.

Consumption is locked and decremented atomically across operating-system processes before tool execution. A failed or uncertain tool invocation still consumes a use. No request is automatically replayed or refunded. Reconfirming an identical active scope revokes the old allowance instead of stacking more calls behind the selected limit. Expired, revoked, exhausted, wrong-project, changed-schema and changed-route grants do not bypass approval. Plan mode never consumes or uses these Build-only allowances.

The local user and trusted local processes control the application’s permission files. This feature reduces repeated prompts for exact calls; it is not operating-system isolation or a defense against another process already able to edit APEX’s private state. Grant-storage errors must not be treated as permission to execute. Normal tool restrictions and project isolation still apply.

Regression tests use fake advertised tools and local temporary storage. They exercise exact scope matching, schema and route changes, expiry and revocation, hidden-value persistence, interactive cancellation, corrupt storage and competing independent processes. They do not connect to an MCP server or make paid API requests.
