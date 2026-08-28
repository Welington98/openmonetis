CREATE TABLE "conexoes_google_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"google_calendar_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_google_agenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conexao_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"tipo_entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"periodo" text NOT NULL,
	"google_event_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cartoes" ADD COLUMN "sync_google_agenda" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "sync_google_agenda" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "conexoes_google_agenda" ADD CONSTRAINT "conexoes_google_agenda_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_google_agenda" ADD CONSTRAINT "eventos_google_agenda_conexao_id_conexoes_google_agenda_id_fk" FOREIGN KEY ("conexao_id") REFERENCES "public"."conexoes_google_agenda"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_google_agenda" ADD CONSTRAINT "eventos_google_agenda_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conexoes_google_agenda_user_id_key" ON "conexoes_google_agenda" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_google_agenda_entidade_key" ON "eventos_google_agenda" USING btree ("conexao_id","tipo_entidade","entidade_id","periodo");--> statement-breakpoint
CREATE INDEX "eventos_google_agenda_conexao_id_idx" ON "eventos_google_agenda" USING btree ("conexao_id");