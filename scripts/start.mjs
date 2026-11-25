// Keep the running server's manifests, server modules and hashed chunks together
// while a developer or QA suite rebuilds .next in the working directory.
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";

const root = process.cwd();
nextEnv.loadEnvConfig(root);
if (!existsSync(join(root, ".next", "BUILD_ID"))) {
  throw Error("Run npm run build before starting the demo.");
}
const release = mkdtempSync(join(tmpdir(), "paypilot-release-"));
try {
  cpSync(join(root, ".next"), join(release, ".next"), {
    recursive: true,
    filter: (p) =>
      !["cache", "dev", "diagnostics", "types"].some(
        (name) => p === join(root, ".next", name),
      ),
  });
  cpSync(join(root, "package.json"), join(release, "package.json"));
  if (existsSync(join(root, "public")))
    cpSync(join(root, "public"), join(release, "public"), { recursive: true });
  symlinkSync(join(root, "node_modules"), join(release, "node_modules"), "dir");
  const url = process.env.DATABASE_URL || "file:./prisma/demo.db";
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules", "next", "dist", "bin", "next"),
      "start",
      release,
      ...process.argv.slice(2),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        DATABASE_URL: url.startsWith("file:")
          ? "file:" + resolve(root, url.slice(5))
          : url,
      },
      stdio: "inherit",
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
  process.exitCode = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      done(code ?? (signal === "SIGINT" || signal === "SIGTERM" ? 0 : 1)),
    );
  });
} finally {
  rmSync(release, { recursive: true, force: true });
}
