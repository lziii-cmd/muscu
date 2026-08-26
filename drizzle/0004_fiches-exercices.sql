-- Fiches d'exécution, portées par le compte.
--
-- Les colonnes vivaient sur « exercises », qui est un catalogue partagé. Or un
-- même mouvement ne s'explique pas de la même façon selon le matériel : le hip
-- thrust se fait dos à un banc en salle et dos au canapé à la maison. Laisser
-- la fiche sur l'exercice ferait gagner la dernière personne importée et
-- donnerait à l'autre des consignes pour du matériel qu'elle n'a pas.
--
-- Aucune fiche n'avait jamais été importée : les colonnes étaient vides, il n'y
-- a donc rien à reprendre.

CREATE TABLE "exercise_guides" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"position" text,
	"execution" text,
	"common_mistake" text,
	"note" text,
	"from_program" boolean DEFAULT false NOT NULL
);--> statement-breakpoint
ALTER TABLE "exercise_guides" ADD CONSTRAINT "exercise_guides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_guides" ADD CONSTRAINT "exercise_guides_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_guides_unique" ON "exercise_guides" USING btree ("user_id","exercise_id");--> statement-breakpoint

ALTER TABLE "exercises" DROP COLUMN "position";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "execution";--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "common_mistake";
