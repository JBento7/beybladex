// ESLint flat config (Next.js 16 removed `next lint`). Same rule set as the
// previous .eslintrc.json ("next/core-web-vitals"); in eslint-config-next 16
// that preset also registers the @typescript-eslint plugin used by inline
// directives.
//
// eslint-plugin-react-hooks 7 (pulled in by eslint-config-next 16) adds React
// Compiler checks that did not exist in the previous setup. They flag existing
// code patterns, not problems caused by the upgrade, so they stay off here to
// keep the lint gate unchanged; adopting them is separate follow-up work
// (docs/ATUALIZACAO-NEXT16.md). rules-of-hooks and exhaustive-deps stay on.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    linterOptions: {
      // ESLint 9 started reporting these by default; ESLint 8 did not.
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      "react-hooks/error-boundaries": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
