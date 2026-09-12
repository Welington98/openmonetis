import { and, eq, exists, or, type SQL } from "drizzle-orm";
import { loanInstallments, loans, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";
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
 */
export function buildAccountTransactionCondition(accountId: string): SQL {
	return or(
		eq(transactions.accountId, accountId),
		exists(
			db
				.select({ one: loanInstallments.transactionId })
				.from(loanInstallments)
				.innerJoin(loans, eq(loans.id, loanInstallments.loanId))
				.where(
					and(
						eq(loanInstallments.transactionId, transactions.id),
						eq(loans.accountId, accountId),
					),
				),
		),
		eq(transactions.note, `${LOAN_DISBURSEMENT_NOTE_PREFIX}${accountId}`),
	) as SQL;
}
