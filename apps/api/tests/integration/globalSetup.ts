import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

/** Brings the test database up to date before any integration test runs. */
export default function setup() {
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], { stdio: "inherit" });
}
