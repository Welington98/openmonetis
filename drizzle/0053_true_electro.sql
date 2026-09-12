ALTER TABLE "itens_lancamento" ADD COLUMN "tipo_transacao" text;--> statement-breakpoint
UPDATE "itens_lancamento" AS "i"
SET "tipo_transacao" = "t"."tipo_transacao"
FROM "lancamentos" AS "t"
WHERE "t"."id" = "i"."lancamento_id" AND "t"."tipo_transacao" != 'Transferência';--> statement-breakpoint
ALTER TABLE "itens_lancamento" ALTER COLUMN "tipo_transacao" SET NOT NULL;
