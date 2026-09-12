CREATE TABLE "itens_lancamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lancamento_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"nome" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"centro_custo_id" uuid,
	"valor" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "detalhado" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "itens_lancamento" ADD CONSTRAINT "itens_lancamento_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_lancamento" ADD CONSTRAINT "itens_lancamento_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_lancamento" ADD CONSTRAINT "itens_lancamento_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_lancamento" ADD CONSTRAINT "itens_lancamento_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_lancamento_lancamento_id_idx" ON "itens_lancamento" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "itens_lancamento_user_id_idx" ON "itens_lancamento" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "itens_lancamento_categoria_id_idx" ON "itens_lancamento" USING btree ("categoria_id");