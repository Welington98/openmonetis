CREATE TABLE "diario_conquistas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"chave_conquista" text NOT NULL,
	"periodo" text DEFAULT '' NOT NULL,
	"conquistado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "diario_registros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data" date NOT NULL,
	"houve_gasto" boolean NOT NULL,
	"valor_gasto" numeric(12, 2),
	"categoria" text,
	"classificacao" text,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diario_sequencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"streak_atual" integer DEFAULT 0 NOT NULL,
	"streak_maximo" integer DEFAULT 0 NOT NULL,
	"ultima_data" date,
	"lembrete_ativo" boolean DEFAULT true NOT NULL,
	"horario_lembrete" text DEFAULT '20:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diario_sequencias_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "diario_conquistas" ADD CONSTRAINT "diario_conquistas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_registros" ADD CONSTRAINT "diario_registros_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diario_sequencias" ADD CONSTRAINT "diario_sequencias_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diario_conquistas_user_id_chave_periodo_key" ON "diario_conquistas" USING btree ("user_id","chave_conquista","periodo");--> statement-breakpoint
CREATE INDEX "diario_conquistas_user_id_idx" ON "diario_conquistas" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diario_registros_user_id_data_key" ON "diario_registros" USING btree ("user_id","data");