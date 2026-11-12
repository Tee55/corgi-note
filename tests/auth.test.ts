import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, api } from "../src/auth.js";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}
const awsConfig = {
  mode: "aws",
  clientId: "test-client",
  domain: "https://login.example.test",
  redirectUri: "https://main.example.test/",
};

test("Amplify config sends the access token to the configured HTTPS API and refuses an expired session", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const session = storage();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: session,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  });
  session.setItem("corgi-token", "test-access-token");
  session.setItem("corgi-expiry", String(Date.now() + 300000));
  const calls: {
    url: string;
    headers: Headers;
    body: BodyInit | null | undefined;
  }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "/config.json")
        return Response.json({
          ...awsConfig,
          apiBaseUrl: "https://api.example.test/",
        });
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      return Response.json({ saved: true });
    },
  );
  await loadConfig();
  const body = JSON.stringify({ title: "A happy day" });
  assert.deepEqual(await api("/entries/test-id", { method: "PUT", body }), {
    saved: true,
  });
  assert.equal(calls[0].url, "https://api.example.test/api/entries/test-id");
  assert.equal(
    calls[0].headers.get("Authorization"),
    "Bearer test-access-token",
  );
  assert.equal(calls[0].headers.get("Content-Type"), "application/json");
  assert.equal(calls[0].body, body);
  session.setItem("corgi-expiry", "0");
  await assert.rejects(api("/entries"), /session expired/);
  assert.equal(
    calls.length,
    1,
    "An expired session must not make an authenticated request.",
  );
});

test("existing same-origin deployments and local mode keep using relative API paths", async (t) => {
  const previous = Object.getOwnPropertyDescriptor(
    globalThis,
    "sessionStorage",
  );
  const session = storage();
  Object.defineProperty(globalThis, "sessionStorage", {
    value: session,
    configurable: true,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "sessionStorage", previous);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  });
  session.setItem("corgi-token", "test-access-token");
  session.setItem("corgi-expiry", String(Date.now() + 300000));
  let config: unknown = awsConfig;
  const calls: { url: string; authorization: string | null }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "/config.json") return Response.json(config);
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("Authorization"),
      });
      return Response.json({ entries: [] });
    },
  );
  await loadConfig();
  await api("/entries");
  assert.deepEqual(calls[0], {
    url: "/api/entries",
    authorization: "Bearer test-access-token",
  });
  config = { mode: "local" };
  await loadConfig();
  await api("/entries");
  assert.deepEqual(calls[1], { url: "/api/entries", authorization: null });
});

test("reject API origins with HTTP, credentials, paths, query strings or fragments", async (t) => {
  let candidate: unknown;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ ...awsConfig, apiBaseUrl: candidate }),
  );
  for (candidate of [
    "http://api.example.test",
    "https://user:password@api.example.test",
    "https://api.example.test/private",
    "https://api.example.test?target=other",
    "https://api.example.test/#other",
    "//api.example.test",
    42,
  ]) {
    await assert.rejects(loadConfig(), /configuration is incomplete/);
  }
});
