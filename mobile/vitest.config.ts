import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const expo = path("./test/stubs/expo.ts");

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"], setupFiles: [path("./test/setup.ts")] },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "expo-secure-store": expo,
      "expo-application": expo,
      "expo-crypto": expo,
    },
  },
});
