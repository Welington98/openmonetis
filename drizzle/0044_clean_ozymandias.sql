CREATE TABLE "configuracoes_orcamento_diario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"periodo" text NOT NULL,
	"modo_calculo" text DEFAULT 'automatico' NOT NULL,
	"limite_diario_personalizado" numeric(12, 2),
	"meta_economia" numeric(12, 2),
	"reserva_seguranca" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diario_registros" ADD COLUMN "lancamento_id" uuid;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "orcamento_diario_limite_verde_pct" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "orcamento_diario_limite_amarelo_pct" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracoes_orcamento_diario" ADD CONSTRAINT "configuracoes_orcamento_diario_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "configuracoes_orcamento_diario_user_id_periodo_key" ON "configuracoes_orcamento_diario" USING btree ("user_id","periodo");--> statement-breakpoint
ALTER TABLE "diario_registros" ADD CONSTRAINT "diario_registros_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE set null ON UPDATE no action;