import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav, MobileSyncIndicator, SecondaryNav, Sidebar } from "@/components/nav";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProgramBounds, hasCalisthenics } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

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

  /*
   * La navigation dépend du compte : tous les programmes ne comportent pas de
   * calisthénie, et les dates ne sont pas les mêmes d'une personne à l'autre.
   */
  const [calisthenics, bounds] = await Promise.all([hasCalisthenics(), getProgramBounds()]);
  const programLabel = bounds
    ? `${formatDate(bounds.startDate)} → ${formatDate(bounds.endDate)}`
    : undefined;

  return (
    <>
      <div className="flex min-h-dvh">
        <Sidebar calisthenics={calisthenics} programLabel={programLabel} />
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
            <SecondaryNav calisthenics={calisthenics} />
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
