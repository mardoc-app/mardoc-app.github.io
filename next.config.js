/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true,
  },
  // For GitHub Pages deployment with a custom domain, basePath is not needed.
  // If deploying to github.io/repo-name, uncomment:
  // basePath: "/markdoc-editor",
};

module.exports = nextConfig;
