export interface RepoFile {
  id: string;
  name: string;
  path: string;
  type: "file" | "folder";
  children?: RepoFile[];
  content?: string;
}

export interface PRComment {
  id: string;
  author: string;
  avatarColor: string;
  body: string;
  createdAt: string;
  blockIndex?: number; // which rendered block this comment is on
  selectedText?: string; // the text that was selected when the comment was created
  resolved: boolean;
}

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  author: string;
  status: "open" | "merged" | "closed";
  createdAt: string;
  baseBranch: string;
  headBranch: string;
  files: PRFile[];
  comments: PRComment[];
  description: string;
}

export interface PRFile {
  path: string;
  baseContent: string;  // content on base branch
  headContent: string;  // content on PR branch
  status: "added" | "modified" | "deleted";
}

export type ViewMode = "editor" | "pr-list" | "pr-diff" | "pr-review";
