CREATE TABLE "emprestimo_parcelas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emprestimo_id" uuid NOT NULL,
	"lancamento_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"numero_parcela" smallint NOT NULL,
	"valor_principal" numeric(12, 2) NOT NULL,
	"valor_juros" numeric(12, 2) NOT NULL,
	"saldo_devedor_apos" numeric(12, 2) NOT NULL,
	"data_vencimento" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emprestimos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conta_id" uuid NOT NULL,
	"direcao" text NOT NULL,
	"valor_principal" numeric(12, 2) NOT NULL,
	"taxa_juros_mensal" numeric(7, 4) NOT NULL,
	"qtde_parcelas" smallint NOT NULL,
	"sistema_amortizacao" text NOT NULL,
	"primeiro_vencimento" date NOT NULL,
	"conta_pagamento_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emprestimo_parcelas" ADD CONSTRAINT "emprestimo_parcelas_emprestimo_id_emprestimos_id_fk" FOREIGN KEY ("emprestimo_id") REFERENCES "public"."emprestimos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprestimo_parcelas" ADD CONSTRAINT "emprestimo_parcelas_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprestimo_parcelas" ADD CONSTRAINT "emprestimo_parcelas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_conta_pagamento_id_contas_id_fk" FOREIGN KEY ("conta_pagamento_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emprestimo_parcelas_emprestimo_id_numero_key" ON "emprestimo_parcelas" USING btree ("emprestimo_id","numero_parcela");--> statement-breakpoint
CREATE INDEX "emprestimo_parcelas_lancamento_id_idx" ON "emprestimo_parcelas" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "emprestimo_parcelas_user_id_idx" ON "emprestimo_parcelas" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emprestimos_conta_id_key" ON "emprestimos" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "emprestimos_user_id_idx" ON "emprestimos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "emprestimos_conta_pagamento_id_idx" ON "emprestimos" USING btree ("conta_pagamento_id");