CREATE TABLE "conexoes_bancarias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pluggy_item_id" text NOT NULL,
	"connector_name" text NOT NULL,
	"status" text DEFAULT 'updating' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linhas_extrato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conexao_bancaria_id" uuid NOT NULL,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"tipo" text NOT NULL,
	"external_id" text NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"categoria_id" uuid,
	"lancamento_correspondente_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "conexao_bancaria_id" uuid;--> statement-breakpoint
ALTER TABLE "conexoes_bancarias" ADD CONSTRAINT "conexoes_bancarias_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_conexao_bancaria_id_conexoes_bancarias_id_fk" FOREIGN KEY ("conexao_bancaria_id") REFERENCES "public"."conexoes_bancarias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_lancamento_correspondente_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_correspondente_id") REFERENCES "public"."lancamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conexoes_bancarias_pluggy_item_id_key" ON "conexoes_bancarias" USING btree ("pluggy_item_id");--> statement-breakpoint
CREATE INDEX "conexoes_bancarias_user_id_idx" ON "conexoes_bancarias" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "linhas_extrato_user_id_status_idx" ON "linhas_extrato" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "linhas_extrato_conexao_bancaria_id_idx" ON "linhas_extrato" USING btree ("conexao_bancaria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linhas_extrato_external_id_key" ON "linhas_extrato" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linhas_extrato_lancamento_correspondente_id_key" ON "linhas_extrato" USING btree ("lancamento_correspondente_id");--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_conexao_bancaria_id_conexoes_bancarias_id_fk" FOREIGN KEY ("conexao_bancaria_id") REFERENCES "public"."conexoes_bancarias"("id") ON DELETE set null ON UPDATE no action;