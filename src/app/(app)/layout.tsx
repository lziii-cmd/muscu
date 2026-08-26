import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav, MobileSyncIndicator, SecondaryNav, Sidebar } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth/current-user";

/**
 * Coquille des pages protégées.
 *
 * La vérification d'authentification est faite ici plutôt que dans `proxy.ts` :
 * elle s'exécute côté serveur avec accès au cookie chiffré, alors qu'un filtre
 * de proxy ne pourrait que constater la présence du cookie, pas sa validité.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-24 sm:px-6 lg:pb-10">
            {user.usesDefaultPassword ? (
              <Link
                href="/compte"
                className="mb-4 block rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
              >
                Mot de passe d&apos;origine encore en place — l&apos;application est accessible
                depuis Internet. Changer maintenant →
              </Link>
            ) : null}

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
