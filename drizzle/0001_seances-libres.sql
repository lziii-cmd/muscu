ALTER TYPE "public"."slot" ADD VALUE 'libre';--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "measure_label" text DEFAULT 'reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN "is_extra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "username" text;