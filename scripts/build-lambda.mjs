import { build } from "esbuild";
await build({
  entryPoints: ["server/lambda.ts"],
  outfile: "dist/lambda/index.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  sourcemap: true,
});
console.log("Lambda bundle ready: dist/lambda/index.mjs");
