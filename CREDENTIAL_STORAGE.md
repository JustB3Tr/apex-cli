# Credential storage

APEX provider keys use the current operating system's secure storage. There is no plaintext file fallback and no automatic installation of keychain utilities. Provider environment variables still take precedence in the CLI/runtime; `credentialVault.get()` itself reads only the saved APEX credential.

| Platform | Backend | Secret transport | Requirement |
| --- | --- | --- | --- |
| Windows | DPAPI, CurrentUser | stdin to system Windows PowerShell | Original Windows user/profile capable of DPAPI decryption |
| macOS | Default Keychain, generic password item | One quoted command through `/usr/bin/security -i` stdin | Available/unlocked keychain; OS access consent may be required |
| Linux | freedesktop Secret Service via `secret-tool` | Exact secret bytes on stdin | Trusted `/usr/bin/secret-tool` or `/bin/secret-tool`, D-Bus session, working unlocked Secret Service collection |
| Other, or unavailable backend | Environment only | Existing provider environment variable | Configure the environment yourself; saving fails closed |

The utilities are invoked directly, without a shell. Unix helpers must be root-owned regular executables whose resolved target is not group/world writable. A project executable or custom `PATH` cannot substitute for them. Windows uses `SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe`, not a project or `PATH` search. Normal OS installation integrity remains a prerequisite.

Secret values are absent from process arguments. macOS writes use security's own quote/escape parser, with no shell expansion. Newlines/control characters are rejected. Apple's published interactive reader has a 4096-byte line bound; APEX rejects a command at that bound before spawning it. Therefore macOS's practical key length is below the general 8192 UTF-8 byte limit, depending on quoting overhead. Use a provider environment variable for a longer token. Linux stdin has no extra newline appended. Neither platform receives provider-key environment variables in the helper's inherited environment.

The helper timeout is 15 seconds and combined output is bounded to 32 KiB. The OS may present an unlock/access prompt; a denial, missing service, timeout, or oversized result is an error, never an instruction to write plaintext. Raw helper stderr and thrown diagnostic text are not passed to the user. Keys necessarily exist briefly in process memory and OS pipes; this does not protect against a compromised user account or another authorized application with access to the same OS keychain. It is not a per-agent permission boundary.

`credentials.enc.json` retains the existing version-1 DPAPI format on Windows. On macOS/Linux it records only provider name, backend, and update time. The secret stays in the OS store. Keychain item identity is scoped by a SHA-256 digest of the absolute APEX home and provider ID. Two APEX homes do not overwrite each other's keys. Renaming/copying the home, moving machines, or changing OS does not transfer usable credentials. Re-enter a key on the destination. An explicit save may replace that provider's local backend reference; it does not remove an old OS store item on another machine.

`status().saved` means a local metadata record exists, not that a key was freshly retrieved. Status does not unlock or read the keychain. `storageAvailable` verifies the utility's availability/integrity, not an unlocked collection or working D-Bus session. A key removed externally returns `null` on lookup while its metadata remains until logout/save, preserving the discrepancy. A locked/denied backend returns an error. Logout removes the APEX-scoped keychain item and then metadata; a failed deletion preserves metadata. Logout cannot revoke a provider key or unset a parent shell's environment variable.

Keychain writes and local metadata writes cannot form a cross-system atomic transaction. A crash after an OS write but before metadata publication may leave an orphan item. A later explicit save at the same home/provider overwrites that exact item. If the home was moved, remove its old APEX item using the OS keychain UI. APEX does not broadly clear collections, silently replay failures, change keychain access lists, or modify other applications' items.

This change covers provider API keys through `credentialVault`. The generic `protect()` ciphertext API used by account-session and room-secret documents still requires Windows DPAPI. Those features need separate cross-platform document-encryption work; provider key support must not be advertised as complete account/room secret portability.

Validation uses injected fixture runners for all three backends, including adversarial punctuation, metadata-only storage, missing/locked services, output bounds, timeouts, concurrent saves, and cross-OS mismatches. Native macOS Keychain and Linux desktop behavior have not been exercised on this Windows host. No real keychain writes, new dependencies, or provider requests are required by those fixtures.

References: [Apple security utility/manual](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.1), [Apple interactive parser and line limit](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.c), [GNOME secret-tool implementation](https://github.com/GNOME/libsecret/blob/main/tool/secret-tool.c).
