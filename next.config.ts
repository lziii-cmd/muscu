import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * PGlite embarque un binaire WebAssembly qu'il localise à partir de
   * `import.meta.url`. Bundlé par Turbopack, ce chemin est réécrit et la
   * résolution échoue (« File URL path must be absolute »). On le laisse donc
   * en dépendance externe côté serveur.
   *
   * Ne concerne que le développement : en production, la base est Neon.
   */
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
