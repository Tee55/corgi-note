// Explicit operator action after SAM deployment. Uses the AWS CLI's configured profile.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
const [stack, region] = process.argv.slice(2);
if (
  !stack ||
  !region ||
  !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(stack) ||
  !/^[a-z]{2}-[a-z]+-\d$/.test(region)
)
  throw new Error("Usage: node scripts/publish-web.mjs <stack-name> <region>");
function aws(args, json = false) {
  const r = spawnSync("aws", [...args, "--region", region, "--no-cli-pager"], {
    encoding: "utf8",
    shell: false,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr || "AWS CLI command failed");
  if (json) return JSON.parse(r.stdout);
  console.log(r.stdout.trim());
}
const response = aws(
  [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stack,
    "--output",
    "json",
  ],
  true,
);
const outputs = Object.fromEntries(
  response.Stacks[0].Outputs.map((o) => [o.OutputKey, o.OutputValue]),
);
if (
  !["SiteUrl", "WebBucket", "ClientId", "LoginDomain", "DistributionId"].every(
    (k) => outputs[k],
  )
)
  throw new Error("Stack outputs are incomplete.");
await fs.access("dist/web/index.html");
await fs.writeFile(
  "dist/web/config.json",
  JSON.stringify(
    {
      mode: "aws",
      clientId: outputs.ClientId,
      domain: outputs.LoginDomain,
      redirectUri: outputs.SiteUrl,
    },
    null,
    2,
  ),
);
aws([
  "s3",
  "sync",
  "dist/web/",
  `s3://${outputs.WebBucket}/`,
  "--exclude",
  "index.html",
  "--exclude",
  "config.json",
  "--cache-control",
  "public,max-age=31536000,immutable",
]);
for (const file of ["index.html", "config.json"])
  aws([
    "s3",
    "cp",
    `dist/web/${file}`,
    `s3://${outputs.WebBucket}/${file}`,
    "--cache-control",
    "no-cache,no-store,must-revalidate",
    "--content-type",
    file.endsWith("json") ? "application/json" : "text/html",
  ]);
aws([
  "cloudfront",
  "create-invalidation",
  "--distribution-id",
  outputs.DistributionId,
  "--paths",
  "/*",
]);
console.log(
  `Published files. Wait for the CloudFront invalidation, then open ${outputs.SiteUrl}`,
);
