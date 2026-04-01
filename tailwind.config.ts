import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          secondary: "var(--surface-secondary)",
          hover: "var(--surface-hover)",
        },
        border: {
          DEFAULT: "var(--border)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          muted: "var(--accent-muted)",
        },
        diff: {
          add: "var(--diff-add)",
          "add-text": "var(--diff-add-text)",
          remove: "var(--diff-remove)",
          "remove-text": "var(--diff-remove-text)",
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "none",
            color: "var(--text-primary)",
            a: { color: "var(--accent)" },
            strong: { color: "var(--text-primary)" },
            h1: { color: "var(--text-primary)" },
            h2: { color: "var(--text-primary)" },
            h3: { color: "var(--text-primary)" },
            h4: { color: "var(--text-primary)" },
            code: { color: "var(--text-primary)" },
            blockquote: { color: "var(--text-secondary)", borderLeftColor: "var(--border)" },
            hr: { borderColor: "var(--border)" },
            "ol > li::marker": { color: "var(--text-muted)" },
            "ul > li::marker": { color: "var(--text-muted)" },
            thead: { borderBottomColor: "var(--border)" },
            "tbody tr": { borderBottomColor: "var(--border)" },
            pre: {
              backgroundColor: "var(--surface-secondary)",
              color: "var(--text-primary)",
            },
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
