export type Config =
  | { mode: "local" }
  | {
      mode: "aws";
      clientId: string;
      domain: string;
      redirectUri: string;
      apiBaseUrl?: string;
    };
let config: Config;
export async function loadConfig() {
  const r = await fetch("/config.json", { cache: "no-store" });
  if (!r.ok)
    throw new Error(
      "The app configuration could not be loaded. Please reload.",
    );
  const c = await r.json();
  if (
    c.mode !== "local" &&
    !(
      c.mode === "aws" &&
      c.clientId &&
      /^https:\/\//.test(c.domain) &&
      /^https:\/\//.test(c.redirectUri) &&
      (c.apiBaseUrl === undefined || isApiOrigin(c.apiBaseUrl))
    )
  )
    throw new Error(
      "The app configuration is incomplete. Please contact the project administrator.",
    );
  config = c;
  return config;
}
function isApiOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.pathname === "/" || url.pathname === "")
    );
  } catch {
    return false;
  }
}
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export function accessToken() {
  const token = sessionStorage.getItem("corgi-token");
  const exp = Number(sessionStorage.getItem("corgi-expiry"));
  return token && exp > Date.now() + 30000 ? token : null;
}
export async function signIn() {
  if (config.mode === "local") return;
  const verifier = b64(crypto.getRandomValues(new Uint8Array(48))),
    state = b64(crypto.getRandomValues(new Uint8Array(24)));
  sessionStorage.setItem("corgi-pkce", verifier);
  sessionStorage.setItem("corgi-state", state);
  const challenge = b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const url = new URL("/oauth2/authorize", config.domain);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  location.assign(url);
}
export async function finishSignIn() {
  if (config.mode === "local") return;
  const q = new URLSearchParams(location.search);
  if (q.has("error")) {
    history.replaceState(null, "", "/");
    throw new Error(
      "Sign-in was cancelled or could not be completed. Please try again.",
    );
  }
  if (!q.has("code")) return;
  const verifier = sessionStorage.getItem("corgi-pkce"),
    state = sessionStorage.getItem("corgi-state");
  history.replaceState(null, "", "/");
  if (!state || state !== q.get("state") || !verifier)
    throw new Error("Sign-in could not be verified. Please sign in again.");
  sessionStorage.removeItem("corgi-state");
  sessionStorage.removeItem("corgi-pkce");
  const r = await fetch(new URL("/oauth2/token", config.domain), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code: q.get("code")!,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
  });
  const token = await r.json();
  if (!r.ok || !token.access_token)
    throw new Error("Sign-in could not be completed. Please try again.");
  sessionStorage.setItem("corgi-token", token.access_token);
  sessionStorage.setItem(
    "corgi-expiry",
    String(Date.now() + token.expires_in * 1000),
  );
  // Partition browser drafts by the account; authorization still happens on the API.
  const claims = JSON.parse(
    atob(
      token.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
    ),
  );
  sessionStorage.setItem("corgi-account", claims.sub);
}
export function signOut() {
  sessionStorage.removeItem("corgi-token");
  sessionStorage.removeItem("corgi-expiry");
  sessionStorage.removeItem("corgi-account");
  if (config.mode === "aws") {
    const url = new URL("/logout", config.domain);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      logout_uri: config.redirectUri,
    }).toString();
    location.assign(url);
  } else location.reload();
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (config.mode === "aws") {
    const token = accessToken();
    if (!token)
      throw new Error(
        "Your session expired. Keep your draft and sign in again.",
      );
    headers.set("Authorization", `Bearer ${token}`);
  }
  const baseUrl =
    config.mode === "aws" ? (config.apiBaseUrl ?? "").replace(/\/$/, "") : "";
  const response = await fetch(`${baseUrl}/api${path}`, { ...init, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.error ??
        (response.status === 401
          ? "Please sign in again. Your draft is safe."
          : "Your journal could not be loaded. Please try again."),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
