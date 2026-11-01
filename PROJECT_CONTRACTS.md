# Human-owned project contracts

APEX can save explicit project requirements, orientation, and producer/consumer changesets. These records help the agent retrieve the intended behavior and evidence without treating a long conversation summary as authority. A record's existence does not establish that its requirement is correct, comprehensively tested, or safe to deploy.

## Requirements and real checks

`/requirements` opens the requirement menu. Draft a title, statement, up to 30 literal public project-relative source files, and up to eight named local check commands. Private/sensitive paths, traversal, and oversized source files are rejected. Selected files are bounded to 250 KB each. Save as private or shared-eligible context. Shared-eligible does not mean automatically published.

Each draft has an owner, incrementing version, exact terms hash, and retained revision history. Only its owner can approve the inspected version. Revising it requires the previous hash and creates a fresh draft, so earlier approval cannot silently apply to new terms. Approval records agreement with the selected terms, not authorization to run their commands.

After approval, choose a named check. APEX shows its exact command, working directory, and limits before asking for execution consent. Plan mode cannot run the check. The check runs as a normal local shell process with a 30-second timeout and 60 KB output bound; it is not an OS sandbox. Do not approve an untrusted command just because it came from a requirement.

The receipt records the actual exit/result and selected source fingerprints before and after execution. Status is `unapproved`, `unknown`, `failing`, `stale`, or `current`. A requirement needs selected files and checks before it can be current. Missing or inconclusive checks stay unknown. Timed-out, cancelled, truncated, spawn-failed, or missing-exit receipts do not count as passing. Changing the selected files, relevant Git commit, bound terms, or source during execution invalidates freshness. Passing a selected command only proves that command's observed result at that source state.

For scripting, `/requirements draft JSON`, `approve ID HASH`, `inspect ID`, `check JSON`, `publish ID HASH`, and `export ID HASH FILE` expose the same stored records. A scripted check must explicitly include `approved:true` after reviewing its command. Saving/inspecting/exporting a command does not execute it. JSON exports create a new file and do not overwrite an existing file.

## Project orientation

`/teach` asks who the project serves, what must not break, and who has the final say, plus optional uncertainties and visibility. Review the exact orientation before approving it. This is human-authored project context, not a model-generated factual certification or a permission policy. It uses the same ownership/version rules and can be revised when the project changes.

## Changes across repositories

`/changeset` coordinates two or more locally registered Git projects. Declare the producer/consumer contract and bind each participant to an approved requirement, its exact hash, a committed baseline, a role, and its declared owner. Creating or approving this record does not edit repositories, publish packages, merge code, or deploy anything.

Each component's owner accepts their exact participant separately after its selected checks are current. The combined state remains incomplete until every participant has current evidence and a matching owner acceptance. Changes to a bound requirement, baseline commit, or selected source can make prior acceptance stale. An `accepted-all` result is a record of exact human acceptance and selected check observations. It is not an atomic multi-repository transaction, integration-test guarantee, synchronized rollout, or production proof.

The UI supports up to ten repository selections. Register participating projects first and create/approve a requirement in each. The command forms are `/changeset draft JSON`, `approve ID HASH`, `inspect ID`, and `accept ID HASH PROJECT_ID`. APEX does not infer that one developer owns every component merely because they can read the files.

## Retrieval, sharing, and the vault

Approved records can be retrieved into bounded project context with provenance labels and source/status information. They remain reference data, never tool/spending permission. Private records stay out of shared-only retrieval. An available local vault materializes records as Markdown notes linked to requirements, selected source files, check observations, and repository components. Vault notes are snapshots; inspect `/requirements` or `/changeset` for current authoritative status.

Publishing requires an approved shared-eligible record, its exact hash, the local owner's identity, and a project connected to a room. The published snapshot omits private revision history and command output. Its declared terms can include command text and public file names, so inspect before publishing. Received room snapshots are peer/owner-reported observations, not checks executed by the recipient or authority over their local runtime.

## Evidence and scope

`tests/project-contracts.test.js` exercises exact approvals, selected checks and freshness, orientation, export/sharing constraints, and multi-repository component acceptance. These fixture results do not establish native remote Git hosting, public deployment behavior, every possible shell, or broad requirement correctness. This system supplements ordinary tests, code review, and source control; it cannot replace them.

Provider keys and collaboration account/room credentials have different storage constraints. Native macOS/Linux keychain operation has not been tested on this Windows host, and generic encrypted account/room documents still use Windows DPAPI. See [CREDENTIAL_STORAGE.md](CREDENTIAL_STORAGE.md) before describing those workflows as cross-platform complete.
