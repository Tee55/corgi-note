import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { localStore } from "../server/local-store.js";
import { createApp } from "../server/app.js";
const input = {
  dogName: "Mochi",
  date: "2026-11-11",
  title: "A very good walk",
  activity: "Walk",
  mood: "Happy",
  body: "Found a new path in the park.",
  photos: [],
  revision: 0,
};
test("journal survives reopening; updates and deletes protect against stale revisions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "corgi-"));
  let store = await localStore(root);
  let app = createApp(store);
  const id = randomUUID();
  try {
    let r = await app.request(`/api/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
    assert.equal(r.status, 201);
    assert.equal((await r.json()).revision, 1);
    store.close();
    store = await localStore(root);
    app = createApp(store);
    r = await app.request("/api/entries");
    assert.equal((await r.json()).entries[0].title, input.title);
    r = await app.request(`/api/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...input, revision: 1, title: "Updated walk" }),
    });
    assert.equal(r.status, 200);
    r = await app.request(`/api/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify({ ...input, revision: 1 }),
    });
    assert.equal(r.status, 409);
    r = await app.request(`/api/entries/${id}?revision=1`, {
      method: "DELETE",
    });
    assert.equal(r.status, 409);
    r = await app.request(`/api/entries/${id}?revision=2`, {
      method: "DELETE",
    });
    assert.equal(r.status, 204);
    r = await app.request("/api/entries");
    assert.equal((await r.json()).entries.length, 0);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("validation rejects bad dates, malformed JSON, cross-origin writes, oversized and disguised photos", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "corgi-"));
  const store = await localStore(root),
    app = createApp(store);
  try {
    for (const body of [
      JSON.stringify({ ...input, date: "2026-02-30" }),
      "{",
      JSON.stringify({ ...input, title: "   " }),
    ])
      assert.equal(
        (
          await app.request(`/api/entries/${randomUUID()}`, {
            method: "PUT",
            body,
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await app.request(`/api/entries/${randomUUID()}`, {
          method: "PUT",
          headers: { Origin: "https://evil.example" },
          body: JSON.stringify(input),
        })
      ).status,
      403,
    );
    let form = new FormData();
    form.append(
      "file",
      new File(['<svg onload="alert(1)"/>'], "fake.png", { type: "image/png" }),
    );
    assert.equal(
      (await app.request("/api/photos", { method: "POST", body: form })).status,
      415,
    );
    form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array(3 * 1024 * 1024 + 1)], "big.jpg", {
        type: "image/jpeg",
      }),
    );
    assert.equal(
      (await app.request("/api/photos", { method: "POST", body: form })).status,
      413,
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("private photos are persisted, served, and cannot reference another owner", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "corgi-"));
  const store = await localStore(root),
    app = createApp(store);
  try {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    );
    const form = new FormData();
    form.append("file", new File([bytes], "dog.png", { type: "image/png" }));
    const response = await app.request("/api/photos", {
      method: "POST",
      body: form,
    });
    assert.equal(response.status, 201);
    const photo = await response.json();
    assert.deepEqual(
      Buffer.from(await (await app.request(photo.url)).arrayBuffer()),
      bytes,
    );
    assert.equal(
      (
        await app.request(`/api/entries/${randomUUID()}`, {
          method: "PUT",
          body: JSON.stringify({
            ...input,
            photos: [{ key: photo.key, alt: "Mochi in the garden" }],
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await app.request(`/api/entries/${randomUUID()}`, {
          method: "PUT",
          body: JSON.stringify({
            ...input,
            photos: [
              { key: photo.key.replace("demo/", "another/"), alt: "private" },
            ],
          }),
        })
      ).status,
      400,
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("cloud fails closed without verified access-token claims and isolates owners", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "corgi-"));
  const store = await localStore(root),
    app = createApp(store, true, "https://journal.example");
  const event = (sub: string, token_use = "access") => ({
    event: {
      requestContext: { authorizer: { jwt: { claims: { sub, token_use } } } },
    },
  });
  try {
    assert.equal(
      (
        await app.request("/api/entries", {
          headers: { Authorization: "Bearer fake", "X-User-Id": "demo" },
        })
      ).status,
      401,
    );
    assert.equal(
      (await app.request("/api/entries", {}, event("alice", "id"))).status,
      401,
    );
    const id = randomUUID();
    assert.equal(
      (
        await app.request(
          `/api/entries/${id}`,
          {
            method: "PUT",
            headers: {
              Origin: "https://journal.example",
              Host: "gateway.execute-api.amazonaws.com",
            },
            body: JSON.stringify(input),
          },
          event("alice"),
        )
      ).status,
      201,
    );
    assert.equal(
      (await (await app.request("/api/entries", {}, event("bob"))).json())
        .entries.length,
      0,
    );
    assert.equal(
      (
        await app.request(
          `/api/entries/${id}?revision=1`,
          { method: "DELETE" },
          event("bob"),
        )
      ).status,
      404,
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
