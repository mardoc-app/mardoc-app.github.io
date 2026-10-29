// Build-time sign-in configuration. Not a secret: the slug is public in the
// install URL (Q-36). The development App sets NEXT_PUBLIC_GITHUB_APP_SLUG.
export const GITHUB_APP_SLUG: string = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || "mardoc-app";
