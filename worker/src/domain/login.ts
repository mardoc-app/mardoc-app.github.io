// Starting a sign-in attempt: `state`, the PKCE verifier and its S256
// challenge, and GitHub's authorize URL. Pure apart from randomness and
// SHA-256 from Web Crypto (LR-11: no network, no config reads).
import { NONCE_PATTERN } from "../../../src/lib/auth/contract";

export const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

/** 32 random bytes, base64url, no padding: always 43 characters. */
export const RANDOM_32_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type RandomBytes = (length: number) => Uint8Array;

export const cryptoRandom: RandomBytes = (length) =>
  crypto.getRandomValues(new Uint8Array(length));

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isNonce(value: string | null): value is string {
  return typeof value === "string" && NONCE_PATTERN.test(value);
}

/** `<nonce>.<32 random bytes, base64url>`. */
export function makeState(nonce: string, random: RandomBytes = cryptoRandom): string {
  return `${nonce}.${base64url(random(32))}`;
}

/** RFC 7636 code verifier: 32 random bytes, base64url (43 characters). */
export function makeVerifier(random: RandomBytes = cryptoRandom): string {
  return base64url(random(32));
}

/** RFC 7636 S256: base64url(SHA-256(ASCII(verifier))). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}

export function authorizeUrl(p: AuthorizeParams): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("redirect_uri", p.redirectUri);
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export interface Attempt {
  state: string;
  verifier: string;
  location: string;
}

/** Everything `/login` needs for one attempt, given an already-checked nonce. */
export async function startAttempt(
  nonce: string,
  config: { clientId: string; redirectUri: string },
  random: RandomBytes = cryptoRandom,
): Promise<Attempt> {
  const state = makeState(nonce, random);
  const verifier = makeVerifier(random);
  const challenge = await challengeFor(verifier);
  const location = authorizeUrl({ ...config, state, challenge });
  return { state, verifier, location };
}
