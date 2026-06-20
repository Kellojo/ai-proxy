import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
    env: {
      DATABASE_PATH: "./data/ai-proxy-test.db",
      WOL_BOOT_WAIT_MS: "0",
      WOL_RETRY_ATTEMPTS: "0",
      MODELS_CACHE_TTL_MS: "0",
      TEST_LIVE_PROVIDER_KIND: "openai",
      TEST_LIVE_PROVIDER_URL: "http://localhost:1234",
      TEST_LIVE_PROVIDER_API_KEY: "dummy",
    },
  },
});
