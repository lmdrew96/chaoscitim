CREATE TABLE "constructions" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"difficulty_tier" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interaction_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"text_id" uuid,
	"sentence_id" integer,
	"token_position" integer,
	"type" text NOT NULL,
	"payload" jsonb,
	"client_created_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text_id" uuid NOT NULL,
	"initial_mode" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"encounters_materialized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_constructions" (
	"text_id" uuid NOT NULL,
	"sentence_id" integer NOT NULL,
	"token_position" integer NOT NULL,
	"construction_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_constructions_text_id_sentence_id_token_position_construction_id_pk" PRIMARY KEY("text_id","sentence_id","token_position","construction_id")
);
--> statement-breakpoint
CREATE TABLE "token_encounters" (
	"session_id" uuid NOT NULL,
	"text_id" uuid NOT NULL,
	"sentence_id" integer NOT NULL,
	"token_position" integer NOT NULL,
	"user_id" text NOT NULL,
	"max_tier_reached" integer NOT NULL,
	"counted_in_curve" boolean DEFAULT true NOT NULL,
	"ms_since_first_event_in_sentence" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "token_encounters_session_id_text_id_sentence_id_token_position_pk" PRIMARY KEY("session_id","text_id","sentence_id","token_position")
);
--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_token_fk" FOREIGN KEY ("text_id","sentence_id","token_position") REFERENCES "public"."text_tokens"("text_id","sentence_id","token_position") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_text_id_texts_id_fk" FOREIGN KEY ("text_id") REFERENCES "public"."texts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_constructions" ADD CONSTRAINT "token_constructions_construction_id_constructions_id_fk" FOREIGN KEY ("construction_id") REFERENCES "public"."constructions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_constructions" ADD CONSTRAINT "token_constructions_token_fk" FOREIGN KEY ("text_id","sentence_id","token_position") REFERENCES "public"."text_tokens"("text_id","sentence_id","token_position") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_encounters" ADD CONSTRAINT "token_encounters_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_encounters" ADD CONSTRAINT "token_encounters_token_fk" FOREIGN KEY ("text_id","sentence_id","token_position") REFERENCES "public"."text_tokens"("text_id","sentence_id","token_position") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interaction_events_session_idx" ON "interaction_events" USING btree ("session_id","client_created_at");--> statement-breakpoint
CREATE INDEX "interaction_events_user_idx" ON "interaction_events" USING btree ("user_id","client_created_at");--> statement-breakpoint
CREATE INDEX "reading_sessions_user_text_idx" ON "reading_sessions" USING btree ("user_id","text_id");--> statement-breakpoint
CREATE INDEX "reading_sessions_open_idx" ON "reading_sessions" USING btree ("ended_at","last_event_at");--> statement-breakpoint
CREATE INDEX "token_constructions_token_idx" ON "token_constructions" USING btree ("text_id","sentence_id","token_position");--> statement-breakpoint
CREATE INDEX "token_constructions_construction_idx" ON "token_constructions" USING btree ("construction_id");--> statement-breakpoint
CREATE INDEX "token_encounters_user_curve_idx" ON "token_encounters" USING btree ("user_id","created_at","max_tier_reached");--> statement-breakpoint
CREATE INDEX "token_encounters_user_tier_idx" ON "token_encounters" USING btree ("user_id","max_tier_reached");