# Command execution boundaries

`/isolation` chooses a profile for the current project. Saving a profile runs no command and downloads no image. The normal approval step still applies to each model-requested command.

## Host mode

Host commands run in the project directory as this OS user. They are not confined: approved commands can read other files, access networks and invoke other programs. APEX filters credential-named variables, configured provider key names, known secret values and credential-bearing URLs from the child environment. This reduces accidental inheritance; it does not stop an approved host command from finding credentials elsewhere.

## Docker copy mode

Choose an already-installed Linux image by immutable `sha256:` ID and 1-40 literal public project files/folders. APEX excludes private paths, symlinks, oversized inputs and detected credentials. It never pulls an image or silently falls back to host execution.

The inspected container runs as UID 65534 with no network, a read-only root/input, dropped capabilities, no-new-privileges, bounded memory/CPU/processes and a disposable writable workspace. Credentials are not passed through. Commands run against a selected copy, not the host checkout. Image contents remain a trust decision; container controls are not a promise against all kernel or Docker vulnerabilities.

Inputs, bounded outputs, a before/after manifest, changes and a receipt stay under the APEX profile's `shell-artifacts` directory. Workspace export uses a bounded tar stream and refuses traversal, links and Windows device paths. Export or cleanup faults are explicit; they never cause a second command execution. Only the randomly named container created for this operation is removed.

There is no automatic copyback. Inspect changes, then request separately approved hash-checked patches if you want to apply them to the host checkout. A check in this selected copy does not automatically verify the complete host project. `/evidence JOB_ID` keeps that distinction.

## Other execution surfaces

This profile applies to the model's `run_shell` tool. User `!` commands, native CLI handoffs, plugin/MCP processes and interactive terminals have their own explicit approval paths and are not made confined by this setting. `/rehearse` and `/extension-trial` are separate confined trials, documented in EXPERIMENTS.md.
