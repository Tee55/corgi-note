import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { awsStore } from "../server/aws-store.js";
import { createApp } from "../server/app.js";

// Set DYNAMODB_LOCAL_ENDPOINT to run against Amazon's DynamoDB Local engine.
const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
test(
  "AWS journal storage supports CRUD, owner isolation and revision conflicts",
  {
    skip: !endpoint && "Requires DynamoDB Local",
  },
  async () => {
    const url = new URL(endpoint!);
    assert.equal(url.protocol, "http:");
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
    const table = `corgi-test-${randomUUID()}`;
    const overrides = {
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "DynamoDBLocal",
      AWS_SECRET_ACCESS_KEY: "DynamoDBLocal",
      AWS_SESSION_TOKEN: "DynamoDBLocal",
      AWS_ENDPOINT_URL_DYNAMODB: endpoint!,
      TABLE_NAME: table,
    };
    const previous = Object.fromEntries(
      Object.keys(overrides).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, overrides);
    const db = new DynamoDBClient({
      endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: "DynamoDBLocal",
        secretAccessKey: "DynamoDBLocal",
      },
    });
    const app = createApp(awsStore(), true, "https://journal.example");
    const event = (sub: string) => ({
      event: {
        requestContext: {
          authorizer: { jwt: { claims: { sub, token_use: "access" } } },
        },
      },
    });
    let created = false;
    try {
      await db.send(
        new CreateTableCommand({
          TableName: table,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "owner", AttributeType: "S" },
            { AttributeName: "id", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "owner", KeyType: "HASH" },
            { AttributeName: "id", KeyType: "RANGE" },
          ],
        }),
      );
      created = true;
      const list = (owner: string) =>
        app.request("/api/entries", {}, event(owner));
      assert.deepEqual(await (await list("alice")).json(), { entries: [] });
      const id = randomUUID();
      const entry = {
        dogName: "Mochi",
        date: "2026-11-12",
        title: "A park adventure",
        activity: "Walk",
        mood: "Happy",
        body: "Found a new path.",
        photos: [],
        revision: 0,
      };
      const save = (revision: number) =>
        app.request(
          `/api/entries/${id}`,
          {
            method: "PUT",
            body: JSON.stringify({ ...entry, revision }),
          },
          event("alice"),
        );
      assert.equal((await save(0)).status, 201);
      const entries = (await (await list("alice")).json()).entries;
      assert.equal(entries.length, 1);
      assert.equal(entries[0].title, entry.title);
      assert.deepEqual(await (await list("bob")).json(), { entries: [] });
      assert.equal((await save(0)).status, 409);
      assert.equal((await save(1)).status, 200);
      const remove = (owner: string, revision: number) =>
        app.request(
          `/api/entries/${id}?revision=${revision}`,
          { method: "DELETE" },
          event(owner),
        );
      assert.equal((await remove("bob", 2)).status, 404);
      assert.equal((await remove("alice", 1)).status, 409);
      assert.equal((await remove("alice", 2)).status, 204);
      assert.deepEqual(await (await list("alice")).json(), { entries: [] });
    } finally {
      try {
        if (created)
          await db.send(new DeleteTableCommand({ TableName: table }));
      } finally {
        db.destroy();
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  },
);
