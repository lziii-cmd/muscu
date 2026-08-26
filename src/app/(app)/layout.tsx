import { redirect } from "next/navigation";
import { BottomNav, MobileSyncIndicator, SecondaryNav, Sidebar } from "@/components/nav";
import { isAuthenticated } from "@/lib/auth/session";

/**
 * Coquille des pages protégées.
 *
 * La vérification d'authentification est faite ici plutôt que dans `proxy.ts` :
 * elle s'exécute côté serveur avec accès au cookie chiffré, alors qu'un filtre
 * de proxy ne pourrait que constater la présence du cookie, pas sa validité.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await isAuthenticated())) redirect("/login");

  return (
    <>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-24 sm:px-6 lg:pb-10">
            <MobileSyncIndicator />
            <SecondaryNav />
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
