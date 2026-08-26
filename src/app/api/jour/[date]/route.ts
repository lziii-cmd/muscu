import { NextResponse } from "next/server";
import { getDay, getWeekFor } from "@/lib/queries";
import { isAuthenticated } from "@/lib/auth/session";

/**
 * Données d'une journée : séances prescrites, séances déjà saisies, semaine.
 *
 * Passe par une route API plutôt que par un composant serveur parce que
 * l'écran de séance doit rester consultable hors-ligne : le client met cette
 * réponse en cache dans IndexedDB, et le service worker la sert depuis son
 * cache si le réseau manque.
 */
export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/jour/[date]">) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  // Next 16 : les paramètres de route sont asynchrones.
  const { date } = await context.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date invalide" }, { status: 400 });
  }

  const [sessions, weeks] = await Promise.all([getDay(date), getWeekFor(date)]);

  return NextResponse.json(
    { date, sessions, weeks },
    {
      headers: {
        // Le référentiel du jour ne change pas ; les séances saisies, si.
        // Revalidation courte, le hors-ligne étant assuré par le cache client.
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    },
  );
}
