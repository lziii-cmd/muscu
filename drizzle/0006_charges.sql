-- Charges : barre, machine, haltères ; kilos ou livres ; charge habituelle.
--
-- 1. « barre_machine » confondait deux choses qui ne se comparent pas : 40 kg
--    à la barre et 40 kg sur une machine guidée. On ajoute « barre » et
--    « machine ». L'ancienne valeur reste valide pour les séances déjà
--    enregistrées ; l'application ne la propose plus.
--
-- 2. Beaucoup de machines affichent des livres. On garde l'unité de SAISIE à
--    côté de la charge, toujours stockée en kilos : l'écran réaffiche le nombre
--    lu sur la machine, les calculs travaillent en kilos.
--
-- 3. Charge habituelle par exercice et par compte : ce que l'écran de séance
--    propose en premier, avant la charge du document.
--
-- Additive : aucune donnée existante n'est modifiée.

ALTER TYPE "load_unit" ADD VALUE IF NOT EXISTS 'barre';--> statement-breakpoint
ALTER TYPE "load_unit" ADD VALUE IF NOT EXISTS 'machine';--> statement-breakpoint
CREATE TYPE "weight_unit" AS ENUM ('kg', 'lb');--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "weight_unit" "weight_unit" DEFAULT 'kg' NOT NULL;--> statement-breakpoint
CREATE TABLE "exercise_loads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"exercise_id" integer NOT NULL REFERENCES "exercises"("id") ON DELETE cascade,
	"load_unit" "load_unit" NOT NULL,
	"weight_kg" numeric(6, 2),
	"weight_unit" "weight_unit" DEFAULT 'kg' NOT NULL,
	"as_of" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_loads_unique" ON "exercise_loads" ("user_id", "exercise_id");
