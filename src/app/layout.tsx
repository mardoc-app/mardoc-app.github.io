import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/lib/auth-provider";
import { AppProvider } from "@/lib/app-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "MarkDoc Editor",
  description: "A collaborative markdown editor with GitHub integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <ThemeProvider>
            <AppProvider>{children}</AppProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
