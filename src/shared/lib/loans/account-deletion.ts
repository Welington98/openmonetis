import { and, eq, inArray } from "drizzle-orm";
import { loanInstallments, loans, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

/**
 * Se a conta sendo excluída é uma conta de empréstimo, apaga as transações
 * de parcela ainda não liquidadas vinculadas a ela. O cascade de
 * `financialAccounts → loans → loanInstallments` não alcança essas
 * transações — elas vivem na conta de pagamento, não na própria conta de
 * empréstimo — então, sem isso, ficariam órfãs no extrato da conta de
 * pagamento. Parcelas já liquidadas ficam intactas — são movimento real de
 * caixa histórico.
 *
 * Precisa rodar dentro da mesma transação que exclui a conta.
 */
export async function cleanupLoanBeforeAccountDeletion(
	tx: typeof db,
	userId: string,
	accountId: string,
): Promise<void> {
	const loan = await tx.query.loans.findFirst({
		columns: { id: true },
		where: and(eq(loans.accountId, accountId), eq(loans.userId, userId)),
	});

	if (!loan) {
		return;
	}

	const unsettledInstallments = await tx
		.select({ transactionId: loanInstallments.transactionId })
		.from(loanInstallments)
		.innerJoin(
			transactions,
			eq(transactions.id, loanInstallments.transactionId),
		)
		.where(
			and(
				eq(loanInstallments.loanId, loan.id),
				eq(transactions.isSettled, false),
			),
		);

	const transactionIds = unsettledInstallments.map((row) => row.transactionId);
	if (transactionIds.length === 0) {
		return;
	}

	await tx.delete(transactions).where(inArray(transactions.id, transactionIds));
}

/**
 * Verdadeiro se a conta financia (paga ou recebe) um empréstimo ativo —
 * usado pra recusar a exclusão dessa conta com uma mensagem amigável, em vez
 * de deixar a violação de FK de `loans.paymentAccountId` (sem `onDelete`)
 * estourar como erro genérico.
 */
export async function isAccountFundingActiveLoan(
	userId: string,
	accountId: string,
): Promise<boolean> {
	const funding = await db.query.loans.findFirst({
		columns: { id: true },
		where: and(eq(loans.userId, userId), eq(loans.paymentAccountId, accountId)),
	});
	return Boolean(funding);
}
