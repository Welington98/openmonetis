import { eq, or, type SQL, sql } from "drizzle-orm";
import { loanInstallments, loans, transactions } from "@/db/schema";
import { LOAN_DISBURSEMENT_NOTE_PREFIX } from "@/shared/lib/loans/constants";

/**
 * Lançamentos de parcela e de desembolso de um empréstimo têm `accountId`
 * apontando pra conta de pagamento (ex.: conta corrente que efetivamente
 * recebe/paga), nunca pra própria conta de empréstimo — o dinheiro de fato
 * sai/entra ali. Sem isso, o extrato da conta de empréstimo fica sempre
 * vazio, mesmo com parcelas pendentes e pagas reais.
 *
 * Amplia o filtro de conta pra também incluir essas linhas quando a conta
 * sendo vista é a própria conta de empréstimo — via `loanInstallments` (
 * parcelas) e via o prefixo de nota do desembolso. Para uma conta comum
 * (ex.: a conta de pagamento), não muda nada: nenhum empréstimo tem
 * `accountId` igual à conta de pagamento, então as condições extras nunca
 * batem.
 *
 * Monta o EXISTS via `sql` puro (em vez do query builder ligado à instância
 * de `db`) porque esse módulo é importado por `page-helpers.ts`, que também
 * é importado por componentes client — puxar a instância de `db` (e o
 * driver `pg`, que depende de módulos Node como `fs`/`net`/`tls`) pra dentro
 * do bundle do cliente quebra o build do Next.
 */
export function buildAccountTransactionCondition(accountId: string): SQL {
	return or(
		eq(transactions.accountId, accountId),
		sql`exists (
			select 1
			from ${loanInstallments}
			inner join ${loans} on ${loans.id} = ${loanInstallments.loanId}
			where ${loanInstallments.transactionId} = ${transactions.id}
				and ${loans.accountId} = ${accountId}
		)`,
		eq(transactions.note, `${LOAN_DISBURSEMENT_NOTE_PREFIX}${accountId}`),
	) as SQL;
}
