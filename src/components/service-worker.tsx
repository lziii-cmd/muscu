"use client";

import { useEffect } from "react";
import { flushOutbox } from "@/lib/local/db";

/**
 * Enregistre le service worker et vide la file d'attente au retour du réseau.
 *
 * Le service worker est écrit à la main dans `public/sw.js` plutôt que généré :
 * Next 16 utilise Turbopack par défaut et fait échouer le build en présence
 * d'une configuration webpack personnalisée, ce dont dépendent les intégrations
 * PWA courantes. Les besoins ici sont simples — précache de la coquille, réseau
 * d'abord pour les données — et la file d'attente vit de toute façon côté
 * application, dans IndexedDB.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Un échec d'enregistrement ne doit pas casser l'application :
        // elle reste utilisable en ligne.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register);

    return () => window.removeEventListener("load", register);
  }, []);

  useEffect(() => {
    const onOnline = () => void flushOutbox();
    const onVisible = () => {
      if (document.visibilityState === "visible") void flushOutbox();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void flushOutbox();

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
