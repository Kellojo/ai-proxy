import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = path.resolve(__dirname, "..");

process.env.DATABASE_PATH = process.env.DATABASE_PATH || path.join(rootDir, "data", "ai-proxy-test.db");

export async function startDevServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import("vite");

  let port = parseInt(process.env.TEST_PORT || "5173", 10);

  const viteServer = await createServer({
    root: rootDir,
    configFile: path.join(rootDir, "vite.config.ts"),
    mode: "development",
    server: { port },
  });

  await viteServer.listen();

  const url = `http://localhost:${viteServer.config.server.port}`;
  console.log(`[test-setup] Dev server started at ${url}`);

  return {
    url,
    close: async () => {
      await viteServer.close();
    },
  };
}

export async function waitForReady(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/providers`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 401 || res.status === 530) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`);
}
