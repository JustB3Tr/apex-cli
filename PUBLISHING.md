# Publishing APEX

Source repository: https://github.com/JustB3Tr/apex-cli, default branch master.
Package: apex-agent-cli. Installed command: apex.

## First public release

The registry lookup returned Not Found on October 30, 2026. This is not a name reservation or a guarantee that npm will accept the name. The local npm session requires authentication.

In PowerShell, from the project root:

```powershell
npm login
npm whoami
npm publish --dry-run --ignore-scripts
npm publish --access public --ignore-scripts
```

Use your own npm account and complete browser/2FA authentication yourself. Do not paste passwords, OTPs or npm tokens into issues or source files. If npm stages the version, inspect and approve the stage through your npm account. Publishing consumes the version number; subsequent changes need a new version.

After successful publication:

```powershell
npm view apex-agent-cli version
npm install --global apex-agent-cli
apex --version
```

Before publication, users can install the GitHub source with `npm install --global github:JustB3Tr/apex-cli#master`. That route does not imply npm registry publication. The package named apex belongs to a different publisher; installing apex-agent-cli provides the apex command.

## Later releases without a stored npm token

After the package exists, configure its npm Settings > Trusted publishing:

- Provider: GitHub Actions
- Owner: JustB3Tr
- Repository: apex-cli
- Workflow filename: publish.yml
- Allow direct npm publish if you intend to use this workflow's publish command.

The workflow is manual only, accepts master only, runs Windows regression checks, then publishes on a GitHub-hosted runner with an OIDC identity and provenance. It requires npm 11.5.1+ and Node 22.14+; the workflow uses Node 24/npm 11. It does not embed an npm token. Configure the trust immediately before using it: npm's new trusted publisher configurations expire if their first successful publish is not within two days. The workflow is not proof of live npm permissions or a successful release.

Source CI uses Windows because saved credential/room state currently depends on Windows DPAPI. Other platforms can use environment credentials/local inference, but full cross-platform validation remains open. No workflow is enabled to publish automatically on push or release creation.

Official guidance:
- https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/
