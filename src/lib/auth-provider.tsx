"use client";

import React from "react";
import { Auth0Provider } from "@auth0/auth0-react";

// These should be set as environment variables.
// For local dev, create a .env.local file:
//   NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.auth0.com
//   NEXT_PUBLIC_AUTH0_CLIENT_ID=your-client-id
//   NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.github.com
//
// Auth0 setup:
// 1. Create an Auth0 Application (Single Page Application)
// 2. Add GitHub as a Social Connection
// 3. In the GitHub connection settings, request these scopes: repo, read:user
// 4. Set Allowed Callback URLs, Logout URLs, and Web Origins to your domain

const AUTH0_DOMAIN = process.env.NEXT_PUBLIC_AUTH0_DOMAIN || "";
const AUTH0_CLIENT_ID = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID || "";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID) {
    // If Auth0 isn't configured, render children without auth wrapper
    // This allows the app to run in "demo mode" with mock data
    return <>{children}</>;
  }

  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: typeof window !== "undefined" ? window.location.origin : "",
        audience: "https://api.github.com",
        scope: "openid profile email",
        connection: "github",
      }}
      cacheLocation="localstorage"
    >
      {children}
    </Auth0Provider>
  );
}
