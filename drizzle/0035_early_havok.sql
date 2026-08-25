CREATE TABLE "metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" text NOT NULL,
	"valor_alvo" numeric(12, 2) NOT NULL,
	"data_inicio" date NOT NULL,
	"data_alvo" date NOT NULL,
	"conta_destino_id" uuid NOT NULL,
	"saldo_inicial" numeric(12, 2) NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_conta_destino_id_contas_id_fk" FOREIGN KEY ("conta_destino_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "metas_user_id_idx" ON "metas" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "metas_conta_destino_id_idx" ON "metas" USING btree ("conta_destino_id");