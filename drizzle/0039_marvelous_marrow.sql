ALTER TABLE "linhas_extrato" ADD COLUMN "origem_categoria" text;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "modo_categorizacao_extrato" text DEFAULT 'manual' NOT NULL;