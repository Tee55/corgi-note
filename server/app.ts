import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { entrySchema, maxPhotoBytes, type Entry } from "../shared/model.js";
import { Conflict, type Store } from "./storage.js";
type Bindings = {
  event?: {
    requestContext?: {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    };
  };
};
export function createApp(
  store: Store,
  cloud = false,
  allowedOrigin = process.env.WEB_ORIGIN,
) {
  const app = new Hono<{ Bindings: Bindings; Variables: { owner: string } }>();
  app.use("*", secureHeaders());
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    // Browser preflights have no access token. API Gateway supplies the CORS
    // headers; answer its unauthenticated OPTIONS route before checking claims.
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    if (cloud) {
      const claims = c.env?.event?.requestContext?.authorizer?.jwt?.claims;
      if (!claims?.sub || claims.token_use !== "access")
        return c.json(
          { error: "Please sign in again to open your journal." },
          401,
        );
      c.set("owner", String(claims.sub));
    } else c.set("owner", "demo");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      if (
        origin &&
        new URL(origin).host !==
          (c.req.header("X-Forwarded-Host") ?? c.req.header("Host"))
      ) {
        // local Vite forwards its original host
        if (
          cloud
            ? origin !== allowedOrigin
            : !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
        )
          return c.json({ error: "Request origin is not allowed." }, 403);
      }
    }
    await next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: maxPhotoBytes + 64 * 1024,
      onError: (c) =>
        c.json({ error: "Choose a photo smaller than 3 MB." }, 413),
    }),
  );
  app.get("/api/health", (c) =>
    c.json({ status: "ok", mode: cloud ? "aws" : "local-demo" }),
  );
  const withUrls = async (owner: string, e: Entry) => ({
    ...e,
    photos: await Promise.all(
      e.photos.map(async (p) => ({
        ...p,
        url: await store.photoUrl(owner, p.key),
      })),
    ),
  });
  app.get("/api/entries", async (c) => {
    const owner = c.get("owner");
    const entries = (await store.list(owner)).sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    );
    return c.json({
      entries: await Promise.all(entries.map((e) => withUrls(owner, e))),
    });
  });
  app.put("/api/entries/:id", async (c) => {
    const id = z.uuid().parse(c.req.param("id")),
      input = entrySchema.parse(await c.req.json()),
      owner = c.get("owner");
    for (const p of input.photos)
      if (!(await store.photoExists(owner, p.key)))
        return c.json(
          { error: "A photo is unavailable. Remove it and attach it again." },
          400,
        );
    const existing = (await store.list(owner)).find((e) => e.id === id);
    if (input.revision > 0 && !existing)
      return c.json({ error: "This memory is no longer available." }, 404);
    const now = new Date().toISOString();
    const entry: Entry = {
      ...input,
      id,
      revision: input.revision + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await store.save(owner, entry, input.revision);
    return c.json(
      await withUrls(owner, entry),
      input.revision === 0 ? 201 : 200,
    );
  });
  app.delete("/api/entries/:id", async (c) => {
    const id = z.uuid().parse(c.req.param("id")),
      expected = z.coerce
        .number()
        .int()
        .positive()
        .parse(c.req.query("revision"));
    if (!(await store.list(c.get("owner"))).some((e) => e.id === id))
      return c.json({ error: "This memory is no longer available." }, 404);
    await store.remove(c.get("owner"), id, expected);
    return c.body(null, 204);
  });
  app.post("/api/photos", async (c) => {
    const data = await c.req.formData(),
      file = data.get("file");
    if (!(file instanceof File))
      return c.json({ error: "Choose a JPEG, PNG or WebP photo." }, 400);
    if (file.size > maxPhotoBytes)
      return c.json({ error: "Choose a photo smaller than 3 MB." }, 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png =
      bytes.length > 24 &&
      Buffer.from(bytes.subarray(0, 8)).equals(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    const jpg =
      bytes.length > 12 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255;
    const webp =
      bytes.length > 16 &&
      Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF" &&
      Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP";
    const type = png
      ? "image/png"
      : jpg
        ? "image/jpeg"
        : webp
          ? "image/webp"
          : null;
    if (!type || file.type !== type)
      return c.json(
        {
          error:
            "This file is not a supported photo. Choose a JPEG, PNG or WebP.",
        },
        415,
      );
    const ext = png ? "png" : jpg ? "jpg" : "webp",
      owner = c.get("owner");
    const key = await store.putPhoto(
      owner,
      `${randomUUID()}.${ext}`,
      bytes,
      type,
    );
    return c.json({ key, url: await store.photoUrl(owner, key) }, 201);
  });
  app.get("/api/photos/:name", async (c) => {
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(c.req.param("name")))
      return c.notFound();
    const photo = await store.readPhoto?.(c.get("owner"), c.req.param("name"));
    if (!photo) return c.notFound();
    c.header("Content-Type", photo.type);
    c.header("Content-Disposition", "inline");
    return c.body(photo.bytes as Uint8Array<ArrayBuffer>);
  });
  app.notFound((c) => c.json({ error: "This page could not be found." }, 404));
  app.onError((e, c) => {
    if (e instanceof z.ZodError)
      return c.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    if (e instanceof SyntaxError)
      return c.json(
        { error: "The request could not be read. Please try again." },
        400,
      );
    if (e instanceof Conflict)
      return c.json(
        {
          error:
            "This memory changed in another window. Your draft is safe. Close the editor, refresh the journal and review the latest version before trying again.",
        },
        409,
      );
    if (e instanceof HTTPException) return e.getResponse();
    const metadata = (
      e as Error & {
        $metadata?: { requestId?: string; httpStatusCode?: number };
      }
    ).$metadata;
    console.error(
      JSON.stringify({
        event: "request-failed",
        name: e.name,
        message: e.message.slice(0, 1000),
        method: c.req.method,
        path: c.req.path,
        awsRequestId: metadata?.requestId,
        awsStatusCode: metadata?.httpStatusCode,
      }),
    );
    return c.json(
      {
        error:
          "Your journal could not be updated. Your draft is safe; please try again.",
      },
      500,
    );
  });
  return app;
}
