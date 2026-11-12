import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  type QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Conflict, type Store } from "./storage.js";
export function awsStore(): Store {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({})),
    s3 = new S3Client({});
  const TableName = process.env.TABLE_NAME!,
    Bucket = process.env.PHOTO_BUCKET!;
  const valid = (owner: string, key: string) =>
    key.startsWith(`${owner}/`) &&
    /^[a-zA-Z0-9_-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key);
  return {
    async list(owner) {
      let cursor: Record<string, unknown> | undefined;
      const entries = [];
      do {
        const r: QueryCommandOutput = await db.send(
          new QueryCommand({
            TableName,
            ConsistentRead: true,
            KeyConditionExpression: "owner = :o",
            ExpressionAttributeValues: { ":o": owner },
            ExclusiveStartKey: cursor,
          }),
        );
        entries.push(...(r.Items ?? []).map((i) => i.entry));
        cursor = r.LastEvaluatedKey;
      } while (cursor);
      return entries;
    },
    async save(owner, entry, expected) {
      try {
        await db.send(
          new PutCommand({
            TableName,
            Item: { owner, id: entry.id, revision: entry.revision, entry },
            ConditionExpression:
              expected === 0 ? "attribute_not_exists(id)" : "revision = :r",
            ...(expected === 0
              ? {}
              : { ExpressionAttributeValues: { ":r": expected } }),
          }),
        );
      } catch (e) {
        if ((e as Error).name === "ConditionalCheckFailedException")
          throw new Conflict();
        throw e;
      }
    },
    async remove(owner, id, expected) {
      try {
        await db.send(
          new DeleteCommand({
            TableName,
            Key: { owner, id },
            ConditionExpression: "revision = :r",
            ExpressionAttributeValues: { ":r": expected },
          }),
        );
      } catch (e) {
        if ((e as Error).name === "ConditionalCheckFailedException")
          throw new Conflict();
        throw e;
      }
    },
    async putPhoto(owner, name, bytes, type) {
      const Key = `${owner}/${name}`;
      await s3.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body: bytes,
          ContentType: type,
          ServerSideEncryption: "AES256",
        }),
      );
      return Key;
    },
    async photoExists(owner, key) {
      if (!valid(owner, key)) return false;
      try {
        await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch (e) {
        if (
          (e as { $metadata?: { httpStatusCode: number } }).$metadata
            ?.httpStatusCode === 404
        )
          return false;
        throw e;
      }
    },
    async photoUrl(owner, key) {
      if (!valid(owner, key)) throw new Error("Invalid photo");
      return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), {
        expiresIn: 300,
      });
    },
  };
}
