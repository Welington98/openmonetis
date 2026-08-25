ALTER TABLE "contas" ADD COLUMN "pluggy_conta_id" text;--> statement-breakpoint
ALTER TABLE "linhas_extrato" ADD COLUMN "pluggy_conta_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "contas_pluggy_conta_id_key" ON "contas" USING btree ("pluggy_conta_id");