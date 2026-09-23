import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import globals from "globals";

const prismaImports = {
  group: ["@prisma/client", "**/config/prisma", "**/config/prisma.js"],
  message: "Only repositories may import Prisma.",
};
const fastifyImports = {
  group: ["fastify", "@fastify/*"],
  message: "Fastify types belong in routes, middlewares, controllers, app.ts and server.ts.",
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
  {
    files: ["apps/frontend/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // API layering. Later blocks override earlier ones for the same rule.
  {
    files: ["apps/api/src/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [prismaImports, fastifyImports] }] },
  },
  {
    files: [
      "apps/api/src/routes/**",
      "apps/api/src/middlewares/**",
      "apps/api/src/controllers/**",
      "apps/api/src/app.ts",
      "apps/api/src/server.ts",
    ],
    rules: { "no-restricted-imports": ["error", { patterns: [prismaImports] }] },
  },
  {
    files: ["apps/api/src/repositories/**", "apps/api/src/config/prisma.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [fastifyImports] }] },
  },
  prettier,
);
