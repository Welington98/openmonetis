CREATE TABLE "centros_custo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo_roteamento" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "centro_custo_id" uuid;--> statement-breakpoint
ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "centros_custo_user_id_idx" ON "centros_custo" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categorias_centro_custo_id_idx" ON "categorias" USING btree ("centro_custo_id");--> statement-breakpoint
-- Backfill: cria os 3 centros de custo padrão (Fixa/Variável/Economia) pra
-- cada usuário já existente, e associa toda categoria de despesa que ainda
-- não tem centro de custo ao centro "Variável" do respectivo usuário — nunca
-- "Fixa" automaticamente, pra não reclassificar despesa sem confirmação do
-- usuário (ver src/shared/lib/cost-centers/constants.ts).
INSERT INTO "centros_custo" ("nome", "tipo_roteamento", "user_id")
SELECT 'Fixa', 'fixa', "id" FROM "user"
UNION ALL
SELECT 'Variável', 'variavel', "id" FROM "user"
UNION ALL
SELECT 'Economia', 'economia', "id" FROM "user";
--> statement-breakpoint
UPDATE "categorias" c
SET "centro_custo_id" = cc."id"
FROM "centros_custo" cc
WHERE cc."user_id" = c."user_id"
	AND cc."tipo_roteamento" = 'variavel'
	AND c."tipo" = 'despesa'
	AND c."centro_custo_id" IS NULL;