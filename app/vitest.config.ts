import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts", "src/lib/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
