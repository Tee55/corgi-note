import { handle } from "hono/aws-lambda";
import { createApp } from "./app.js";
import { awsStore } from "./aws-store.js";
export const handler = handle(createApp(awsStore(), true));
