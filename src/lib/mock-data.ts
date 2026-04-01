import { RepoFile, PullRequest } from "@/types";

export const repoFiles: RepoFile[] = [
  {
    id: "1",
    name: "docs",
    path: "docs",
    type: "folder",
    children: [
      {
        id: "2",
        name: "getting-started.md",
        path: "docs/getting-started.md",
        type: "file",
        content: `# Getting Started

Welcome to the **MarkDoc Editor** — a collaborative markdown workspace backed by GitHub.

## Installation

To get started, clone the repository and install dependencies:

\`\`\`bash
git clone https://github.com/your-org/markdoc-editor.git
cd markdoc-editor
npm install
npm run dev
\`\`\`

## Quick Start

1. Open the sidebar to browse your repository files
2. Click on any markdown file to open it in the editor
3. Edit using the WYSIWYG toolbar or write raw markdown
4. Changes are automatically synced to GitHub

## Features

- **WYSIWYG Editing**: Write markdown with a rich text editor
- **GitHub Sync**: All files are backed by a GitHub repository
- **PR Reviews**: Review pull requests with rendered diff views
- **Inline Comments**: Comment on specific sections of documents
- **Dark Mode**: Toggle between light and dark themes

## Architecture

The application uses a modern React stack with Next.js for server-side rendering and TipTap for the editor component. The GitHub integration uses Octokit to interact with the GitHub API.

> **Note**: This is a prototype with mock data. GitHub integration will be added in a future release.
`,
      },
      {
        id: "3",
        name: "api-reference.md",
        path: "docs/api-reference.md",
        type: "file",
        content: `# API Reference

This document covers the core APIs available in the MarkDoc Editor.

## Editor API

### \`useEditor()\`

Returns the TipTap editor instance with all configured extensions.

\`\`\`typescript
const editor = useEditor({
  extensions: [StarterKit, Placeholder],
  content: initialContent,
});
\`\`\`

### \`useDocument(path: string)\`

Fetches and manages a document from the GitHub repository.

\`\`\`typescript
const { content, save, loading } = useDocument("docs/readme.md");
\`\`\`

## GitHub API

### Authentication

All API calls require a valid GitHub token. Configure your token in the settings panel or via environment variables.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/files\` | List repository files |
| GET | \`/api/files/:path\` | Get file content |
| PUT | \`/api/files/:path\` | Update file content |
| POST | \`/api/pr\` | Create pull request |
| GET | \`/api/pr/:id\` | Get PR details |

## Webhooks

The editor supports GitHub webhooks for real-time synchronization. Configure your webhook URL in the repository settings.

---

*Last updated: March 2026*
`,
      },
      {
        id: "8",
        name: "contributing.md",
        path: "docs/contributing.md",
        type: "file",
        content: `# Contributing Guide

Thank you for your interest in contributing to MarkDoc Editor!

## Development Setup

Fork the repository and create a feature branch:

\`\`\`bash
git checkout -b feature/my-new-feature
\`\`\`

## Pull Request Process

1. Ensure your code passes all linting checks
2. Write or update tests as needed
3. Update documentation for any changed functionality
4. Submit a PR against the \`main\` branch

## Code Style

We follow the project's ESLint and Prettier configuration. Run \`npm run lint\` before submitting.

## Reporting Issues

Please use GitHub Issues to report bugs. Include:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
`,
      },
    ],
  },
  {
    id: "4",
    name: "README.md",
    path: "README.md",
    type: "file",
    content: `# MarkDoc Editor

A collaborative markdown editor with GitHub integration, PR review capabilities, and inline commenting.

## Overview

MarkDoc Editor brings a Notion-like editing experience to your GitHub-backed markdown files. Review PRs with rendered diffs, leave inline comments, and collaborate seamlessly.

## Key Features

- Rich WYSIWYG markdown editing
- GitHub repository integration
- Pull request review with rendered diffs
- Inline commenting and review threads
- Light and dark mode support

## Getting Started

See the [Getting Started Guide](docs/getting-started.md) for installation and setup instructions.

## License

MIT
`,
  },
  {
    id: "5",
    name: "CHANGELOG.md",
    path: "CHANGELOG.md",
    type: "file",
    content: `# Changelog

## v0.1.0 - 2026-03-31

### Added
- Initial release with core editor functionality
- GitHub mock integration
- PR diff viewer with rendered comparison
- Inline commenting system
- Light and dark mode themes
- File tree sidebar navigation

### Known Issues
- GitHub API integration is mocked (coming in v0.2.0)
- Real-time collaboration not yet supported
`,
  },
];

export const pullRequests: PullRequest[] = [
  {
    id: "pr-1",
    number: 42,
    title: "Update getting started guide with new installation steps",
    author: "joe.barnett",
    status: "open",
    createdAt: "2026-03-30T14:30:00Z",
    baseBranch: "main",
    headBranch: "docs/update-getting-started",
    description: "Updates the getting started guide with clearer installation instructions and adds a troubleshooting section.",
    files: [
      {
        path: "docs/getting-started.md",
        status: "modified",
        baseContent: `# Getting Started

Welcome to the **MarkDoc Editor** — a collaborative markdown workspace backed by GitHub.

## Installation

To get started, clone the repository and install dependencies:

\`\`\`bash
git clone https://github.com/your-org/markdoc-editor.git
cd markdoc-editor
npm install
npm run dev
\`\`\`

## Quick Start

1. Open the sidebar to browse your repository files
2. Click on any markdown file to open it in the editor
3. Edit using the WYSIWYG toolbar or write raw markdown
4. Changes are automatically synced to GitHub

## Features

- **WYSIWYG Editing**: Write markdown with a rich text editor
- **GitHub Sync**: All files are backed by a GitHub repository
- **PR Reviews**: Review pull requests with rendered diff views
- **Inline Comments**: Comment on specific sections of documents
- **Dark Mode**: Toggle between light and dark themes

## Architecture

The application uses a modern React stack with Next.js for server-side rendering and TipTap for the editor component. The GitHub integration uses Octokit to interact with the GitHub API.

> **Note**: This is a prototype with mock data. GitHub integration will be added in a future release.`,
        headContent: `# Getting Started

Welcome to the **MarkDoc Editor** — a collaborative markdown workspace backed by GitHub.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v18 or higher
- **npm** v9 or higher (or yarn/pnpm)
- A **GitHub account** with a personal access token

## Installation

To get started, clone the repository and install dependencies:

\`\`\`bash
git clone https://github.com/your-org/markdoc-editor.git
cd markdoc-editor
npm install
\`\`\`

Then configure your environment:

\`\`\`bash
cp .env.example .env.local
# Edit .env.local with your GitHub token
\`\`\`

Start the development server:

\`\`\`bash
npm run dev
\`\`\`

## Quick Start

1. Open the sidebar to browse your repository files
2. Click on any markdown file to open it in the editor
3. Edit using the WYSIWYG toolbar or write raw markdown
4. Changes are automatically synced to GitHub
5. Use the PR view to review changes before merging

## Features

- **WYSIWYG Editing**: Write markdown with a rich text editor
- **GitHub Sync**: All files are backed by a GitHub repository
- **PR Reviews**: Review pull requests with rendered diff views
- **Inline Comments**: Comment on specific sections of documents
- **Dark Mode**: Toggle between light and dark themes
- **Keyboard Shortcuts**: Fast editing with familiar shortcuts

## Troubleshooting

### Common Issues

**Port already in use**: If port 3000 is taken, use \`npm run dev -- -p 3001\`.

**GitHub token errors**: Ensure your token has \`repo\` scope permissions.

**Build failures**: Try deleting \`node_modules\` and \`.next\`, then run \`npm install\` again.

## Architecture

The application uses a modern React stack with Next.js for server-side rendering and TipTap for the editor component. The GitHub integration uses Octokit to interact with the GitHub API.

> **Note**: This is a prototype with mock data. Full GitHub integration coming in v0.2.0.`,
      },
    ],
    comments: [
      {
        id: "c1",
        author: "sarah.chen",
        avatarColor: "#e76f51",
        body: "Great addition! The prerequisites section is really helpful for newcomers.",
        createdAt: "2026-03-30T15:00:00Z",
        blockIndex: 1,
        resolved: false,
      },
      {
        id: "c2",
        author: "alex.kim",
        avatarColor: "#2a9d8f",
        body: "Should we mention that Docker is also an option? We have a docker-compose setup.",
        createdAt: "2026-03-30T16:30:00Z",
        blockIndex: 3,
        resolved: false,
      },
    ],
  },
  {
    id: "pr-2",
    number: 43,
    title: "Add API rate limiting documentation",
    author: "sarah.chen",
    status: "open",
    createdAt: "2026-03-29T09:00:00Z",
    baseBranch: "main",
    headBranch: "docs/api-rate-limits",
    description: "Adds documentation about API rate limiting behavior and best practices.",
    files: [
      {
        path: "docs/api-reference.md",
        status: "modified",
        baseContent: `# API Reference

This document covers the core APIs available in the MarkDoc Editor.

## Editor API

### \`useEditor()\`

Returns the TipTap editor instance with all configured extensions.

\`\`\`typescript
const editor = useEditor({
  extensions: [StarterKit, Placeholder],
  content: initialContent,
});
\`\`\`

### \`useDocument(path: string)\`

Fetches and manages a document from the GitHub repository.

\`\`\`typescript
const { content, save, loading } = useDocument("docs/readme.md");
\`\`\`

## GitHub API

### Authentication

All API calls require a valid GitHub token. Configure your token in the settings panel or via environment variables.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/files\` | List repository files |
| GET | \`/api/files/:path\` | Get file content |
| PUT | \`/api/files/:path\` | Update file content |
| POST | \`/api/pr\` | Create pull request |
| GET | \`/api/pr/:id\` | Get PR details |

## Webhooks

The editor supports GitHub webhooks for real-time synchronization. Configure your webhook URL in the repository settings.

---

*Last updated: March 2026*`,
        headContent: `# API Reference

This document covers the core APIs available in the MarkDoc Editor.

## Editor API

### \`useEditor()\`

Returns the TipTap editor instance with all configured extensions.

\`\`\`typescript
const editor = useEditor({
  extensions: [StarterKit, Placeholder],
  content: initialContent,
});
\`\`\`

### \`useDocument(path: string)\`

Fetches and manages a document from the GitHub repository.

\`\`\`typescript
const { content, save, loading } = useDocument("docs/readme.md");
\`\`\`

## GitHub API

### Authentication

All API calls require a valid GitHub token. Configure your token in the settings panel or via environment variables.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | \`/api/files\` | List repository files |
| GET | \`/api/files/:path\` | Get file content |
| PUT | \`/api/files/:path\` | Update file content |
| POST | \`/api/pr\` | Create pull request |
| GET | \`/api/pr/:id\` | Get PR details |

### Rate Limiting

The API enforces rate limits to ensure fair usage:

- **Authenticated requests**: 5,000 per hour
- **Unauthenticated requests**: 60 per hour
- **Search API**: 30 requests per minute

When you exceed the rate limit, the API returns a \`429 Too Many Requests\` response with a \`Retry-After\` header.

\`\`\`typescript
// Example: handling rate limits
try {
  const response = await api.getFiles();
} catch (error) {
  if (error.status === 429) {
    const retryAfter = error.headers["retry-after"];
    console.log(\`Rate limited. Retry after \${retryAfter}s\`);
  }
}
\`\`\`

## Webhooks

The editor supports GitHub webhooks for real-time synchronization. Configure your webhook URL in the repository settings.

---

*Last updated: March 2026*`,
      },
    ],
    comments: [
      {
        id: "c3",
        author: "joe.barnett",
        avatarColor: "#264653",
        body: "We should also document the GraphQL API rate limits — they use a point system instead of simple request counts.",
        createdAt: "2026-03-29T10:15:00Z",
        blockIndex: 5,
        resolved: false,
      },
    ],
  },
  {
    id: "pr-3",
    number: 38,
    title: "Reorganize changelog format",
    author: "alex.kim",
    status: "merged",
    createdAt: "2026-03-25T11:00:00Z",
    baseBranch: "main",
    headBranch: "chore/changelog-format",
    description: "Reorganizes the changelog to follow Keep a Changelog format.",
    files: [
      {
        path: "CHANGELOG.md",
        status: "modified",
        baseContent: `# Changelog

## v0.1.0

- Initial release
- Added editor
- Added dark mode`,
        headContent: `# Changelog

## v0.1.0 - 2026-03-31

### Added
- Initial release with core editor functionality
- GitHub mock integration
- PR diff viewer with rendered comparison
- Inline commenting system
- Light and dark mode themes
- File tree sidebar navigation

### Known Issues
- GitHub API integration is mocked (coming in v0.2.0)
- Real-time collaboration not yet supported`,
      },
    ],
    comments: [],
  },
];

// Helper to find a file in the tree
export function findFile(files: RepoFile[], path: string): RepoFile | null {
  for (const file of files) {
    if (file.path === path) return file;
    if (file.children) {
      const found = findFile(file.children, path);
      if (found) return found;
    }
  }
  return null;
}

// Helper to flatten file tree
export function flattenFiles(files: RepoFile[]): RepoFile[] {
  const result: RepoFile[] = [];
  for (const file of files) {
    if (file.type === "file") result.push(file);
    if (file.children) result.push(...flattenFiles(file.children));
  }
  return result;
}
