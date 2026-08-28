ALTER TABLE "cartoes" ADD COLUMN "conexao_bancaria_id" uuid;--> statement-breakpoint
ALTER TABLE "cartoes" ADD COLUMN "pluggy_conta_id" text;--> statement-breakpoint
ALTER TABLE "linhas_extrato" ADD COLUMN "pluggy_conta_tipo" text;--> statement-breakpoint
ALTER TABLE "cartoes" ADD CONSTRAINT "cartoes_conexao_bancaria_id_conexoes_bancarias_id_fk" FOREIGN KEY ("conexao_bancaria_id") REFERENCES "public"."conexoes_bancarias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cartoes_pluggy_conta_id_key" ON "cartoes" USING btree ("pluggy_conta_id");