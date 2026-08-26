-- Passage du compte unique aux comptes multiples.
--
-- Migration additive : aucune donnée n'est perdue. Le compte décrit par
-- « settings » devient la première ligne de « users », et toutes les lignes
-- déjà en base lui sont rattachées. Son mot de passe est conservé tel quel.
--
-- Les index d'unicité sont re-cadrés sur le compte : sans cela, la deuxième
-- personne ne pourrait pas enregistrer une séance le jour où la première en a
-- une — le conflit surviendrait à la première utilisation réelle.

CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"uses_default_password" boolean DEFAULT true NOT NULL,
	"protein_per_kg_low" numeric(3, 1) DEFAULT '1.8' NOT NULL,
	"protein_per_kg_high" numeric(3, 1) DEFAULT '2.2' NOT NULL,
	"water_target_liters" numeric(3, 1) DEFAULT '3.5' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username");--> statement-breakpoint

-- Reprise du compte existant, avec son mot de passe et ses cibles de diète.
INSERT INTO "users" ("username", "password_hash", "display_name", "role", "uses_default_password",
                     "protein_per_kg_low", "protein_per_kg_high", "water_target_liters")
SELECT coalesce(nullif(lower(trim("username")), ''), 'compte'),
       "password_hash",
       coalesce(nullif(trim("display_name"), ''), 'Compte'),
       'user',
       false,
       "protein_per_kg_low", "protein_per_kg_high", "water_target_liters"
FROM "settings"
WHERE "password_hash" IS NOT NULL;--> statement-breakpoint

-- Filet : une base sans compte configuré peut malgré tout contenir des lignes
-- (le référentiel importé par le seed). Il leur faut un propriétaire. Le préfixe
-- « desactive$ » n'est pas un schéma de hachage connu : aucune connexion n'est
-- possible sur ce compte, l'administrateur le supprime après reprise.
INSERT INTO "users" ("username", "password_hash", "display_name", "uses_default_password")
SELECT 'reprise', 'desactive$', 'Compte de reprise', false
WHERE NOT EXISTS (SELECT 1 FROM "users");--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "alerts" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "alerts" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bodyweight_entries" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "bodyweight_entries" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "bodyweight_entries" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bodyweight_entries" ADD CONSTRAINT "bodyweight_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "checkpoints" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "checkpoints" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ladders" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "ladders" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "ladders" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ladders" ADD CONSTRAINT "ladders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "meal_logs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "meal_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "measurements" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "measurements" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oil_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "oil_logs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "oil_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oil_logs" ADD CONSTRAINT "oil_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pain_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "pain_logs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "pain_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pain_logs" ADD CONSTRAINT "pain_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "programs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "progress_photos" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "progress_photos" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_photos" ADD CONSTRAINT "progress_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rice_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "rice_logs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "rice_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rice_logs" ADD CONSTRAINT "rice_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "sessions" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sleep_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "sleep_logs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sleep_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sleep_logs" ADD CONSTRAINT "sleep_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strength_tests" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "strength_tests" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "strength_tests" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "strength_tests" ADD CONSTRAINT "strength_tests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "targets" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "targets" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "targets" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_metrics" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "test_metrics" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "test_metrics" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "test_metrics" ADD CONSTRAINT "test_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD COLUMN "user_id" integer;--> statement-breakpoint
UPDATE "water_logs" SET "user_id" = (SELECT min("id") FROM "users") WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "water_logs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Index d'unicité re-cadrés sur le compte.
DROP INDEX IF EXISTS "bodyweight_date_key";--> statement-breakpoint
CREATE UNIQUE INDEX "bodyweight_date_key" ON "bodyweight_entries" USING btree ("user_id","date");--> statement-breakpoint
DROP INDEX IF EXISTS "checkpoints_date_key";--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_date_key" ON "checkpoints" USING btree ("user_id","date");--> statement-breakpoint
DROP INDEX IF EXISTS "ladders_slug_key";--> statement-breakpoint
CREATE UNIQUE INDEX "ladders_slug_key" ON "ladders" USING btree ("user_id","slug");--> statement-breakpoint
DROP INDEX IF EXISTS "meal_logs_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "meal_logs_unique" ON "meal_logs" USING btree ("user_id","date","slot");--> statement-breakpoint
DROP INDEX IF EXISTS "measurements_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_unique" ON "measurements" USING btree ("user_id","date","kind");--> statement-breakpoint
DROP INDEX IF EXISTS "oil_logs_date_key";--> statement-breakpoint
CREATE UNIQUE INDEX "oil_logs_date_key" ON "oil_logs" USING btree ("user_id","date");--> statement-breakpoint
DROP INDEX IF EXISTS "programs_code_key";--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_key" ON "programs" USING btree ("user_id","code");--> statement-breakpoint
DROP INDEX IF EXISTS "rice_logs_date_key";--> statement-breakpoint
CREATE UNIQUE INDEX "rice_logs_date_key" ON "rice_logs" USING btree ("user_id","date");--> statement-breakpoint
DROP INDEX IF EXISTS "sessions_date_slot_key";--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_date_slot_key" ON "sessions" USING btree ("user_id","date","slot");--> statement-breakpoint
DROP INDEX IF EXISTS "sleep_logs_date_key";--> statement-breakpoint
CREATE UNIQUE INDEX "sleep_logs_date_key" ON "sleep_logs" USING btree ("user_id","date");--> statement-breakpoint
DROP INDEX IF EXISTS "strength_tests_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "strength_tests_unique" ON "strength_tests" USING btree ("user_id","date","metric");--> statement-breakpoint
DROP INDEX IF EXISTS "targets_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "targets_unique" ON "targets" USING btree ("user_id","slug","date");--> statement-breakpoint
DROP INDEX IF EXISTS "test_metrics_slug_key";--> statement-breakpoint
CREATE UNIQUE INDEX "test_metrics_slug_key" ON "test_metrics" USING btree ("user_id","slug");--> statement-breakpoint
DROP INDEX IF EXISTS "water_logs_date_key";--> statement-breakpoint
CREATE UNIQUE INDEX "water_logs_date_key" ON "water_logs" USING btree ("user_id","date");--> statement-breakpoint
-- « settings » est remplacée : identité, mot de passe et cibles de diète vivent
-- désormais sur le compte.
DROP TABLE "settings";