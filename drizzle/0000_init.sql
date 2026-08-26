CREATE TYPE "public"."exercise_unit" AS ENUM('reps', 'seconds');--> statement-breakpoint
CREATE TYPE "public"."load_unit" AS ENUM('barre_machine', 'kg_par_haltere', 'poids_du_corps');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('petit_dejeuner', 'collation_matin', 'dejeuner', 'collation_apres_midi', 'diner', 'post_seance');--> statement-breakpoint
CREATE TYPE "public"."measurement_kind" AS ENUM('taille', 'bras', 'cuisse', 'poitrine');--> statement-breakpoint
CREATE TYPE "public"."missed_reason" AS ENUM('fatigue', 'sommeil', 'travail', 'blessure', 'maladie', 'voyage', 'salle_indisponible', 'motivation', 'repos_volontaire', 'autre');--> statement-breakpoint
CREATE TYPE "public"."photo_angle" AS ENUM('face', 'profil', 'dos');--> statement-breakpoint
CREATE TYPE "public"."session_location" AS ENUM('salle', 'maison');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'in_progress', 'done', 'partial', 'missed', 'moved');--> statement-breakpoint
CREATE TYPE "public"."skip_reason" AS ENUM('machine_occupee', 'douleur', 'manque_de_temps', 'remplace', 'autre');--> statement-breakpoint
CREATE TYPE "public"."slot" AS ENUM('salle', 'matin', 'soir');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"message" text NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bodyweight_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric(5, 2) NOT NULL,
	"fasted" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"label" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"muscle_group" text,
	"equipment" text,
	"unit" "exercise_unit" DEFAULT 'reps' NOT NULL,
	"is_bodyweight" boolean DEFAULT false NOT NULL,
	"position" text,
	"execution" text,
	"common_mistake" text
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"portion_label" text NOT NULL,
	"protein_g" numeric(5, 1) NOT NULL,
	"kcal" integer,
	"price_fcfa" integer,
	"is_local" boolean DEFAULT true NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "ladder_levels" (
	"id" serial PRIMARY KEY NOT NULL,
	"ladder_id" integer NOT NULL,
	"level" integer NOT NULL,
	"movement" text NOT NULL,
	"criterion" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ladder_progress" (
	"ladder_id" integer PRIMARY KEY NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"clean_streak" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ladders" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_level" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_log_id" integer NOT NULL,
	"food_id" integer NOT NULL,
	"portions" numeric(5, 2) DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"kind" "measurement_kind" NOT NULL,
	"value_cm" numeric(5, 1) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oil_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"tablespoons" numeric(4, 1) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pain_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"area" text NOT NULL,
	"intensity" integer NOT NULL,
	"is_joint" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "program_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"order_label" text NOT NULL,
	"order_index" integer NOT NULL,
	"superset_group" text,
	"sets" integer,
	"reps_low" integer,
	"reps_high" integer,
	"hold_seconds_low" integer,
	"hold_seconds_high" integer,
	"max_offset" integer,
	"per_side" boolean DEFAULT false NOT NULL,
	"load_raw" text,
	"load_kg" numeric(6, 2),
	"dumbbell_raw" text,
	"dumbbell_kg" numeric(6, 2),
	"rest_seconds" integer,
	"cue" text,
	"home_alternative" text
);
--> statement-breakpoint
CREATE TABLE "program_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"date" date NOT NULL,
	"slot" "slot" NOT NULL,
	"label" text NOT NULL,
	"heading" text,
	"is_rest_day" boolean DEFAULT false NOT NULL,
	"is_test_day" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_id" integer NOT NULL,
	"week_number" integer NOT NULL,
	"block_name" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"instruction" text
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"angle" "photo_angle" NOT NULL,
	"url" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rice_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"fists" numeric(3, 1) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"program_exercise_id" integer,
	"exercise_id" integer NOT NULL,
	"order_index" integer NOT NULL,
	"order_label" text,
	"done" boolean DEFAULT false NOT NULL,
	"skip_reason" "skip_reason",
	"weight_kg" numeric(6, 2),
	"load_unit" "load_unit",
	"machine_note" text,
	"sets_done" integer,
	"reps_done" integer,
	"hold_seconds_done" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "session_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_exercise_id" integer NOT NULL,
	"set_index" integer NOT NULL,
	"reps" integer,
	"hold_seconds" integer,
	"weight_kg" numeric(6, 2),
	"rir" integer,
	"technical_failure" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"program_session_id" integer,
	"date" date NOT NULL,
	"slot" "slot" NOT NULL,
	"status" "session_status" DEFAULT 'planned' NOT NULL,
	"location" "session_location" DEFAULT 'salle' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"rpe" integer,
	"note" text,
	"missed_reason" "missed_reason",
	"missed_note" text,
	"moved_to_date" date,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"password_hash" text,
	"display_name" text DEFAULT 'Moi' NOT NULL,
	"protein_per_kg_low" numeric(3, 1) DEFAULT '1.8' NOT NULL,
	"protein_per_kg_high" numeric(3, 1) DEFAULT '2.2' NOT NULL,
	"weekly_loss_target_low" numeric(3, 2) DEFAULT '0.30' NOT NULL,
	"weekly_loss_target_high" numeric(3, 2) DEFAULT '0.50' NOT NULL,
	"water_target_liters" numeric(3, 1) DEFAULT '3.5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sleep_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"bedtime" text,
	"wake_time" text,
	"duration_minutes" integer,
	"quality" integer,
	"resting_hr" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "strength_tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"metric" text NOT NULL,
	"value" numeric(6, 1),
	"level" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"movement" text NOT NULL,
	"unit" "exercise_unit" NOT NULL,
	"date" date NOT NULL,
	"value" integer,
	"start_label" text
);
--> statement-breakpoint
CREATE TABLE "test_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"unit" "exercise_unit" NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"liters" numeric(3, 1) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ladder_levels" ADD CONSTRAINT "ladder_levels_ladder_id_ladders_id_fk" FOREIGN KEY ("ladder_id") REFERENCES "public"."ladders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ladder_progress" ADD CONSTRAINT "ladder_progress_ladder_id_ladders_id_fk" FOREIGN KEY ("ladder_id") REFERENCES "public"."ladders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_log_id_meal_logs_id_fk" FOREIGN KEY ("meal_log_id") REFERENCES "public"."meal_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_program_session_id_program_sessions_id_fk" FOREIGN KEY ("program_session_id") REFERENCES "public"."program_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_weeks" ADD CONSTRAINT "program_weeks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_program_exercise_id_program_exercises_id_fk" FOREIGN KEY ("program_exercise_id") REFERENCES "public"."program_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_sets" ADD CONSTRAINT "session_sets_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_program_session_id_program_sessions_id_fk" FOREIGN KEY ("program_session_id") REFERENCES "public"."program_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bodyweight_date_key" ON "bodyweight_entries" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoints_date_key" ON "checkpoints" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_slug_key" ON "exercises" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_slug_key" ON "foods" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ladder_levels_unique" ON "ladder_levels" USING btree ("ladder_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "ladders_slug_key" ON "ladders" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "meal_logs_unique" ON "meal_logs" USING btree ("date","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "measurements_unique" ON "measurements" USING btree ("date","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "oil_logs_date_key" ON "oil_logs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "program_exercises_session_idx" ON "program_exercises" USING btree ("program_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_sessions_unique" ON "program_sessions" USING btree ("program_id","date","slot");--> statement-breakpoint
CREATE INDEX "program_sessions_date_idx" ON "program_sessions" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "program_weeks_unique" ON "program_weeks" USING btree ("program_id","week_number");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_code_key" ON "programs" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "rice_logs_date_key" ON "rice_logs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "session_exercises_session_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_sets_unique" ON "session_sets" USING btree ("session_exercise_id","set_index");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_date_slot_key" ON "sessions" USING btree ("date","slot");--> statement-breakpoint
CREATE INDEX "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sleep_logs_date_key" ON "sleep_logs" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "strength_tests_unique" ON "strength_tests" USING btree ("date","metric");--> statement-breakpoint
CREATE INDEX "sync_mutations_applied_idx" ON "sync_mutations" USING btree ("applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "targets_unique" ON "targets" USING btree ("slug","date");--> statement-breakpoint
CREATE UNIQUE INDEX "test_metrics_slug_key" ON "test_metrics" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "water_logs_date_key" ON "water_logs" USING btree ("date");