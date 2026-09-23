# MarDoc

**Markdown is the AI era's lingua franca. MarDoc makes it accessible to everyone on your team.**

AI-generated reports, specs, research, and documentation increasingly live in GitHub alongside the work that produced them. MarDoc brings a document-oriented reading and review experience to those repositories: rendered Markdown and HTML, comments on selected passages, and Markdown editing that can become a real pull request.

Product managers, designers, writers, engineers, and other reviewers can work with the same version-controlled documents without making raw diffs their primary reading surface.

MarDoc is a browser-only application, built as a static site and hosted on GitHub Pages. There is no MarDoc authentication server or database. GitHub requests go directly from your browser to GitHub; your PAT is saved in browser localStorage. Documents can also load external assets. See [data storage and security](docs/data-and-security.md) for the exact boundaries and the known HTML isolation gap.

![MarDoc screenshot](docs/assets/screenshot.png)

## Start using MarDoc

1. Open [mardoc.app](https://mardoc.app) to explore the built-in demo documents and PRs.
2. To work with a repository, open Settings → **GitHub Connection** and enter a personal access token using the [setup guide](docs/setup-github-pat.md).
3. Open the **Repository** tab, choose a repository, then browse files or open a pull request.

Demo mode supports exploring rendering, editing, and review interactions. It does not write to GitHub, and image uploads are disabled.

## What you can do

- **Read Markdown as a document.** Render headings, tables, images, code blocks, Mermaid diagrams, footnotes, and GitHub alerts. Review Markdown PR changes in Inline Diff, Split, Suggest, or Preview mode.
- **Review HTML reports.** View rendered HTML or source, compare base/head versions in a PR, and select passages to comment. HTML does not yet have the Markdown editor's WYSIWYG, word-diff, or suggestion parity.
- **Discuss a pull request.** Queue inline comments, finish a review, approve or request changes, reply to threads, and resolve conversations. The usual submission batches comments into one review; invalid line mappings can require separate fallback comments.
- **Edit Markdown and propose changes.** Use the rich editor or code view, create a new document, or add a file to an existing PR. The edit-to-PR action for existing files has a [known save-path issue](docs/known-issues.md#edit-02-existing-file-edit-to-pr-save-path). Accepting an individual suggestion commits to the PR branch.
- **Work with images.** Paste or drop supported images and configure their repository folder. For an existing document, upload commits immediately to the selected branch. Images in a new-file draft are deferred until save.
- **Navigate long documents.** Use the outline, find/replace, wide layout, dark mode, keyboard cheatsheet (`?`), and command palette (`Cmd/Ctrl+Shift+P`). Mobile layouts provide a navigation drawer and review comment sheet.

Draft recovery applies to existing repository Markdown files. New/local files and pending review comments do not have the same persistence. Markdown conversion also has known fidelity limits, including HTML comments and complex tables. Read the [capability matrix and workflows](docs/capabilities.md) before relying on these behaviors for a particular document.

## Documentation

Start with the [documentation index](docs/README.md). Key references:

- [Capabilities and workflows](docs/capabilities.md)
- [GitHub token setup](docs/setup-github-pat.md)
- [Architecture and data flow](docs/architecture.md)
- [Data storage and security](docs/data-and-security.md)
- [Development, testing, and static deployment](docs/development.md)
- [Feature status](docs/features/README.md) and [known issues](docs/known-issues.md)

## Run locally

Use Node.js 22, matching CI:

```bash
git clone https://github.com/mardoc-app/mardoc-app.github.io.git
cd mardoc-app.github.io
npm ci
npm run dev
```

Open http://localhost:3000. No environment variables are required for demo mode or PAT authentication. To preview the production static export:

```bash
npm run build
npx --yes serve out -l 3000 --no-clipboard
```

The current `npm start` script uses `next start`, which is incompatible with this project's static export. Use the static server command above. See the [development guide](docs/development.md) for tests and deployment details.

## Architecture

Next.js 14 exports a static React application. Browser-side Octokit uses GitHub REST and GraphQL. Showdown, TipTap, and Turndown handle Markdown rendering/editing; HTML reports use an iframe. Tailwind provides styling. The core hosting model requires no application backend.

## License


[Elastic License 2.0](./LICENSE) (ELv2).

Source is available. You can read the code, run it locally, self-host MarDoc for your own internal use, fork it, and contribute back. You **cannot** provide MarDoc to third parties as a hosted or managed service — that's a commercial right reserved for the maintainers.

This is a deliberate choice. The MIT license would let any well-capitalized dev-tools company clone MarDoc and ship it as a paid SaaS with no obligation back to the project; ELv2 closes that door while keeping the code visible, forkable, and self-hostable.

See [elastic.co/licensing/elastic-license](https://www.elastic.co/licensing/elastic-license) for the canonical license text.

## Contributing

Use the [development guide](docs/development.md) and [feature documentation conventions](docs/features/README.md). New behavior needs appropriate unit or component coverage; use browser tests for integration behavior. Before proposing application changes, run the relevant tests, the complete unit suite, and the static build. Update the current reference docs and feature status in the same change.

Bug reports and feature requests: [open an issue](https://github.com/mardoc-app/mardoc-app.github.io/issues).
