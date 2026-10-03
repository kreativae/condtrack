import path from "node:path";
import { defineConfig } from "vitest/config";

// Testes das regras de negócio (funções puras de src/lib). Rodam com: npm test
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // "server-only" só impede importar no navegador; nos testes não faz nada
      "server-only": path.resolve(__dirname, "src/lib/__tests__/server-only.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
