-- Fiche de profil : stature, date de naissance, poids visé.
--
-- Ces trois valeurs ne changent pas d'un jour à l'autre — contrairement au
-- poids et aux mensurations, qui restent dans le journal. Les mettre sur le
-- compte évite de les redemander à chaque saisie.
--
-- « height_cm » est la stature. Le « tour de taille » reste une mensuration :
-- l'un ne bouge pas, l'autre est précisément ce qu'on suit.

ALTER TABLE "users" ADD COLUMN "height_cm" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "target_weight_kg" numeric(5, 2);
