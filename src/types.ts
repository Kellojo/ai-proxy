import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

// Use dedicated in-memory database during tests to avoid collisions with dev instance.
if (process.env.TEST_DATABASE !== "true") {
  const dbPath = process.env.DATABASE_PATH;
  if (dbPath) { try { fs.unlinkSync(dbPath); } catch {} }
} else {
  process.env.DATABASE_PATH = "";
}

// Start the SvelteKit dev server so tests hit a real localhost:5173 proxy.
const devServer = spawn("npm", ["run", "dev"], { cwd: rootDir, stdio: "ignore" });
let readyResolve: (() => void) | undefined;
const readyPromise = new Promise<void>((resolve) => { readyResolve = resolve; });

devServer.stdout.on("data", (data: Buffer) => {
  const text = data.toString();
  if (/5173/.test(text)) try { readyResolve?.(); } catch {}
});

export function setReady() { readyResolve?.(); }

readyPromise.then(() => console.log("[vitest setup] SvelteKit dev server is ready on :5173"));
