import tsparser from "@typescript-eslint/parser";
import eslint from "@eslint/js";
import tsPlugin from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

// Extract obsidian rules from the recommended preset (it's a flat rules object)
const obsidianRules = obsidianmd.configs.recommended;

export default [
  eslint.configs.recommended,
  ...tsPlugin.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: {
      obsidianmd,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...obsidianRules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    ignores: ["main.js", "dist/", "node_modules/", ".eslintrc*"],
  },
];
