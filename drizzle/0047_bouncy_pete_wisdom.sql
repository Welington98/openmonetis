ALTER TABLE "lancamentos" ADD COLUMN "centro_custo_id" uuid;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_centro_custo_id_centros_custo_id_fk" FOREIGN KEY ("centro_custo_id") REFERENCES "public"."centros_custo"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_centro_custo_id_idx" ON "lancamentos" USING btree ("centro_custo_id");--> statement-breakpoint
UPDATE "lancamentos" l SET "centro_custo_id" = c."centro_custo_id"
	FROM "categorias" c
	WHERE c.id = l.categoria_id AND c."centro_custo_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" DROP CONSTRAINT "categorias_centro_custo_id_centros_custo_id_fk";--> statement-breakpoint
DROP INDEX "categorias_centro_custo_id_idx";--> statement-breakpoint
ALTER TABLE "categorias" DROP COLUMN "centro_custo_id";
