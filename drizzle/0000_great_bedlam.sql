CREATE TABLE "text_sentences" (
	"text_id" uuid NOT NULL,
	"sentence_id" integer NOT NULL,
	"sentence_text" text NOT NULL,
	"char_start" integer NOT NULL,
	"char_end" integer NOT NULL,
	CONSTRAINT "text_sentences_text_id_sentence_id_pk" PRIMARY KEY("text_id","sentence_id")
);
--> statement-breakpoint
CREATE TABLE "text_tokens" (
	"text_id" uuid NOT NULL,
	"sentence_id" integer NOT NULL,
	"token_position" integer NOT NULL,
	"surface_form" text NOT NULL,
	"lemma" text NOT NULL,
	"upos" text NOT NULL,
	"xpos" text,
	"features" jsonb,
	"head_position" integer,
	"deprel" text NOT NULL,
	"enriched_se_reading" text,
	"gloss_en" text,
	"ambiguity_alternatives" jsonb,
	"mwt_id" integer,
	"mwt_surface_form" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "text_tokens_text_id_sentence_id_token_position_pk" PRIMARY KEY("text_id","sentence_id","token_position")
);
--> statement-breakpoint
CREATE TABLE "texts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"source_url" text,
	"source_type" text NOT NULL,
	"license" text NOT NULL,
	"raw_content" text NOT NULL,
	"raw_content_original" text,
	"raw_content_hash" text NOT NULL,
	"cefr_level" text NOT NULL,
	"topic_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"analyzer_model_version" text NOT NULL,
	"analyzer_license" text NOT NULL,
	"analyzed_at" timestamp with time zone NOT NULL,
	"word_count" integer NOT NULL,
	"sentence_count" integer NOT NULL,
	"owner_id" text,
	"visibility" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "text_sentences" ADD CONSTRAINT "text_sentences_text_id_texts_id_fk" FOREIGN KEY ("text_id") REFERENCES "public"."texts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_tokens" ADD CONSTRAINT "text_tokens_sentence_fk" FOREIGN KEY ("text_id","sentence_id") REFERENCES "public"."text_sentences"("text_id","sentence_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "text_tokens_read_order_idx" ON "text_tokens" USING btree ("text_id","sentence_id","token_position");--> statement-breakpoint
CREATE INDEX "text_tokens_text_lemma_idx" ON "text_tokens" USING btree ("text_id","lemma");--> statement-breakpoint
CREATE INDEX "text_tokens_lemma_upos_idx" ON "text_tokens" USING btree ("lemma","upos");--> statement-breakpoint
CREATE INDEX "text_tokens_deprel_idx" ON "text_tokens" USING btree ("deprel");--> statement-breakpoint
CREATE INDEX "texts_owner_idx" ON "texts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "texts_visibility_idx" ON "texts" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "texts_cefr_idx" ON "texts" USING btree ("cefr_level");