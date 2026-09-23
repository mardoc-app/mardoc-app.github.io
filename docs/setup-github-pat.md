# Connect GitHub with a personal access token

MarDoc calls GitHub directly from your browser using a personal access token (PAT). It supports classic and fine-grained tokens; choose one your organization permits and scope it to the work you need. No Auth0 setup or environment variable is required.

The token is saved in browser localStorage and sent to GitHub to authenticate requests. Read [data storage and security](data-and-security.md), including the current HTML isolation gap, before connecting sensitive repositories.

## Fine-grained token

1. Open [GitHub token settings](https://github.com/settings/personal-access-tokens/new).
2. Choose a descriptive name, expiration, and resource owner.
3. Select the repositories MarDoc should access.
4. Choose repository permissions for your workflows using the table below.
5. Generate the token; obtain organization approval if required.
6. In MarDoc, open Settings → **GitHub Connection**, paste the token, and click **Connect**. Then select a repository in the **Repository** tab.

| Workflow | Contents | Pull requests |
| --- | --- | --- |
| Browse documents and read PRs | Read | Read |
| Review an existing PR, reply, approve/request changes | Read | Read and write |
| Edit/create documents, create review PRs, accept suggestions, upload images | Read and write | Read and write |

Contents write is required for file commits and image uploads; read-only access is insufficient. [GitHub documents this requirement for file creation/update](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).

MarDoc uses issue-comment endpoints for general PR comments and fallback comments. GitHub documents **Pull requests: write** or **Issues: write** as alternative permission sets for creating those comments; a separate Issues permission is not normally required when Pull requests write is granted. [Issue comment permissions](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment)

Fine-grained tokens are scoped to a resource owner and selected repositories. Organization approval and token limitations can affect access; check [GitHub's current token guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) if you work across organizations or as an outside collaborator. Token permissions do not bypass branch protection or grant repository access your account lacks.

## Classic token

1. Open [classic token settings](https://github.com/settings/tokens) and choose **Generate new token (classic)**.
2. Set a descriptive name and expiration.
3. Select `repo` for the connected private-repository review/edit workflow. This grants broad repository access within your account's permissions; it does not limit the token to one selected repository.
4. Generate and copy the token. For an organization using SAML SSO, authorize the token through **Configure SSO** as described in [GitHub's SSO guide](https://docs.github.com/en/authentication/authenticating-with-single-sign-on/authorizing-a-personal-access-token-for-use-with-single-sign-on).
5. Paste it into Settings → **GitHub Connection**, connect, and select a repository.

The current in-app help also suggests `read:org`. That scope concerns organization membership information; it is not a universal prerequisite for listing repositories accessible to the authenticated user. Start troubleshooting missing repositories with account access, token scope, SSO authorization, and organization policy rather than assuming this extra scope fixes every case. [Repository listing permissions](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)

Some organizations restrict classic PATs or require approval for fine-grained PATs. Follow the organization's policy; [GitHub documents these controls](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization).

## Disconnect or revoke

**Disconnect** removes the saved token and repository preference from MarDoc. It does not erase drafts/preferences or comprehensively clear in-memory credentials. See [storage lifecycle](data-and-security.md). Deleting the token in GitHub settings revokes its API access.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Bad credentials / 401 | Full token copied, token not expired or revoked; reconnect with a valid token. |
| Repository missing / 403 / 404 | Access on github.com, selected resource owner/repos, organization approval/policy, and classic-token SSO authorization. |
| Can read but cannot save or upload | Contents write, your repository role, and branch rules. |
| Cannot submit a review or reply | Pull requests write and GitHub's review restrictions for your account/PR. |
| Some comments/files absent on a large PR | Current app pagination limits; see [known issues](known-issues.md). |
| Rate-limit message | Allow the reset interval to pass; repeated retries are not a permission fix. |

Do not include a token in bug reports, screenshots, committed files, or public build variables. Report the operation, error/status code, and token type/permission names instead.
