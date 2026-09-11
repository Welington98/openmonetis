ALTER TABLE "lancamentos" ADD COLUMN "intervalo_meses" smallint DEFAULT 1;--> statement-breakpoint
UPDATE "lancamentos" SET "condicao" = 'Fixa' WHERE "condicao" = 'Recorrente';