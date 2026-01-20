import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    languageOptions: { globals: globals.browser },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      // Flat config requires plugins to be an object mapping names to plugin objects.
      react: pluginReact,
      "react-hooks": reactHooks,
    },
    rules: {
      // React Hooks rules (avoid using reactHooks.configs.* because some versions ship eslintrc-style configs).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // TypeScript recommended rules (flat config).
  tseslint.configs.recommended,

  // React recommended rules (flat config).
  pluginReact.configs.flat.recommended,
]);
