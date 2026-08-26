import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Configuration ESLint (format plat, imposé par Next 16).
 *
 * `eslint-config-next` publie ses presets en CommonJS : ils s'importent par
 * l'export par défaut, pas par un export nommé.
 */
const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      /*
       * L'interface est intégralement en français, où l'apostrophe est un
       * caractère de texte courant (« aujourd'hui », « l'huile », « d'une »).
       * Cette règle imposerait de l'échapper à chaque occurrence, ce qui rend
       * le texte illisible dans le code sans rien apporter : React échappe déjà
       * le contenu JSX, il n'y a aucun risque d'injection.
       */
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // Les scripts d'outillage tournent en Node, hors du bundle applicatif.
    files: ["scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    ignores: [".next/**", "node_modules/**", ".pglite/**", "data/**", "drizzle/**"],
  },
];

export default eslintConfig;
