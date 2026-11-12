import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { Conflict, type Store } from "./storage.js";
import type { Entry } from "../shared/model.js";
export async function localStore(
  root = ".local",
): Promise<Store & { close(): void }> {
  await mkdir(path.join(root, "photos"), { recursive: true });
  const db = new DatabaseSync(path.join(root, "journal.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS entries (owner TEXT, id TEXT, revision INTEGER, data TEXT, PRIMARY KEY(owner,id))",
  );
  const safe = (owner: string, key: string) => {
    if (!new RegExp(`^${owner}/[a-f0-9-]+\\.(jpg|png|webp)$`).test(key))
      throw new Error("Invalid photo");
    return path.join(root, "photos", key);
  };
  return {
    async list(owner) {
      return db
        .prepare("SELECT data FROM entries WHERE owner=?")
        .all(owner)
        .map((x) => JSON.parse(x.data as string));
    },
    async save(owner, e, expected) {
      if (expected === 0) {
        try {
          db.prepare("INSERT INTO entries VALUES (?,?,?,?)").run(
            owner,
            e.id,
            e.revision,
            JSON.stringify(e),
          );
        } catch {
          throw new Conflict();
        }
      } else if (
        !db
          .prepare(
            "UPDATE entries SET revision=?,data=? WHERE owner=? AND id=? AND revision=?",
          )
          .run(e.revision, JSON.stringify(e), owner, e.id, expected).changes
      )
        throw new Conflict();
    },
    async remove(owner, id, expected) {
      if (
        !db
          .prepare("DELETE FROM entries WHERE owner=? AND id=? AND revision=?")
          .run(owner, id, expected).changes
      )
        throw new Conflict();
    },
    async putPhoto(owner, name, bytes) {
      const key = `${owner}/${name}`;
      await mkdir(path.join(root, "photos", owner), { recursive: true });
      await writeFile(safe(owner, key), bytes, { flag: "wx" });
      return key;
    },
    async photoExists(owner, key) {
      try {
        return (await stat(safe(owner, key))).isFile();
      } catch {
        return false;
      }
    },
    async photoUrl(owner, key) {
      safe(owner, key);
      return `/api/photos/${key.split("/")[1]}`;
    },
    async readPhoto(owner, name) {
      try {
        const bytes = await readFile(safe(owner, `${owner}/${name}`));
        return {
          bytes,
          type: name.endsWith(".png")
            ? "image/png"
            : name.endsWith(".webp")
              ? "image/webp"
              : "image/jpeg",
        };
      } catch {
        return null;
      }
    },
    close() {
      db.close();
    },
  };
}
