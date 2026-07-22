import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
