import { and, eq, ne, or } from "drizzle-orm";
import { loanInstallments, transactions } from "@/db/schema";
import type { db } from "@/shared/lib/db";

export type LoanInstallmentLegs = {
	installmentId: string;
	/** Perna de transferência-saída (principal), na conta de pagamento. */
	transferOutId: string;
	/** Perna de transferência-entrada (principal), na conta de empréstimo — NUNCA muda de conta. */
	transferInId: string | null;
	/** Lançamento de juros, na conta de pagamento, quando a parcela tem juros. */
	interestId: string | null;
};

/**
 * Dado o id de uma transação, descobre se ela é uma das pernas de uma
 * parcela de empréstimo (perna de transferência-saída, perna de
 * transferência-entrada na conta de empréstimo — achada via `transferId`
 * compartilhado — ou a perna de juros) e retorna os ids de TODAS as pernas
 * daquela parcela, separados por papel (pra quem for atualizar a conta de
 * pagamento saber que a perna da conta de empréstimo nunca muda). Usado
 * tanto por `payLoanInstallmentAction` quanto pela liquidação genérica de
 * lançamentos, pra nunca liquidar só uma perna de uma transferência e deixar
 * o saldo do empréstimo incoerente.
 *
 * Só server-side (usado dentro de/antes de um `db.transaction`) — nunca
 * importar esse módulo de um componente client.
 */
export async function findLoanInstallmentLegs(
	tx: typeof db,
	transactionId: string,
): Promise<LoanInstallmentLegs | null> {
	const installment = await tx.query.loanInstallments.findFirst({
		where: or(
			eq(loanInstallments.transactionId, transactionId),
			eq(loanInstallments.interestTransactionId, transactionId),
		),
		columns: { id: true, transactionId: true, interestTransactionId: true },
		with: {
			transaction: { columns: { transferId: true } },
		},
	});

	if (!installment) return null;

	let transferInId: string | null = null;
	if (installment.transaction?.transferId) {
		const sibling = await tx.query.transactions.findFirst({
			where: and(
				eq(transactions.transferId, installment.transaction.transferId),
				ne(transactions.id, installment.transactionId),
			),
			columns: { id: true },
		});
		transferInId = sibling?.id ?? null;
	}

	return {
		installmentId: installment.id,
		transferOutId: installment.transactionId,
		transferInId,
		interestId: installment.interestTransactionId,
	};
}
