import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { localStore } from "./local-store.js";
const store = await localStore(process.env.DATA_DIR ?? ".local");
serve(
  {
    fetch: createApp(store).fetch,
    port: Number(process.env.PORT ?? 3001),
    hostname: "127.0.0.1",
  },
  () => console.log("Corgi Note demo API: http://127.0.0.1:3001"),
);
