# Publishing APEX

Public source: https://github.com/JustB3Tr/apex-cli, branch `master`.
Package: `apex-agent-cli`. Installed command: `apex`.
The separate `apex-cli-private` repository remains private.

## Release from GitHub source

1. Commit the intended version and lockfile, README, license/notice and workflow changes.
2. Run the manual **Build verified npm artifact** workflow (`release-artifact.yml`) against `master`. It checks out GitHub source, installs dependencies, runs all CI tests and runtime self-tests, builds the tarball, compares its contents to that checkout and uploads the tarball/checksum/proof. It does not publish to npm.
3. Download that run's `apex-npm-release` artifact. Verify its version, commit and SHA-256 against the GitHub run and proof before publishing. Do not substitute an older locally built tarball.
4. Attach the verified GitHub-built tarball and checksum to the matching versioned GitHub release. A draft can remain unpublished until registry publication succeeds.

The workflow uses no stored npm token and makes no paid model requests. Public source and a public registry package make their included code/files visible; private state, `.Codex`, credentials, local profiles and raw test artifacts must remain excluded.

## First registry publication

A first publication requires the intended npm account. Use npm's own web login; never reuse a token pasted into an old chat or put tokens in repository files.

```sh
npm login --auth-type=web
npm whoami
npm publish PATH_TO_VERIFIED_GITHUB_ARTIFACT.tgz --access public --ignore-scripts
```

Complete any browser authentication, 2FA or staged-publication approval in the npm account. A browser login or successful dry run does not prove publication. Do not automatically retry an ambiguous publish: inspect the registry version first.

After success, independently check the registry and a fresh installation:

```sh
npm view apex-agent-cli version dist.integrity
npm install --global apex-agent-cli
apex --version
```

Check the downloaded registry tarball against the GitHub-built release artifact. A published version cannot be silently replaced; make another version for further changes. `apex` is the command, not the package name to install.

## Later tokenless releases

After the package exists, configure its npm Settings > Trusted publishing for:

- Provider: GitHub Actions
- Owner: `JustB3Tr`
- Repository: `apex-cli`
- Workflow: `publish.yml`

Then use the manual **Publish npm** workflow. It runs Windows verification before publishing on a GitHub-hosted Linux runner with OIDC/provenance. The package repository URL must match the actual public source repository. Private-repository provenance is not supported by npm's documented flow. No workflow publishes automatically on an ordinary source push.

First-publication bootstrap and future trusted-publisher setup are separate. Do not claim the trusted publisher is configured or a version is available until those states are verified.

Official references: [public packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/), [trusted publishing](https://docs.npmjs.com/trusted-publishers/).
