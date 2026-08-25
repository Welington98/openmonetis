ALTER TABLE "pre_lancamentos" ADD COLUMN "tipo_item" text DEFAULT 'notification' NOT NULL;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "parsed_date" date;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "anexo_id" uuid;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_anexo_id_anexos_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."anexos"("id") ON DELETE set null ON UPDATE no action;