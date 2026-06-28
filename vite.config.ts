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
    testTimeout: 120_000,
    env: {
      DATABASE_PATH: "./data/ai-proxy-test.db",
      TEST_LIVE_PROVIDER_KIND: "openai",
      TEST_LIVE_PROVIDER_URL: "http://localhost:1234/v1",
      TEST_MODEL: "ornith-1.0-35b",
      TEST_LIVE_PROVIDER_API_KEY: "dummy",
    },
  } as any,
});
