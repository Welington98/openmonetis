import { and, eq, lt, lte, sql } from "drizzle-orm";
import { loanInstallments, loans, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { safeToNumber as toNumber } from "@/shared/utils/number";

/**
 * Saldo devedor/recebível de cada empréstimo do usuário, igual ao princípio
 * já usado pra dívida de cartão de crédito: nunca lido de
 * `financialAccounts.initialBalance` (que fica em 0 pra contas de
 * empréstimo), sempre derivado das parcelas efetivamente liquidadas.
 *
 * Sinal: negativo pra "contratado" (dívida — quanto mais liquidado, mais
 * perto de 0), positivo pra "concedido" (recebível — quanto mais liquidado,
 * mais perto de 0).
 */
export async function fetchLoanOutstandingBalances(
	userId: string,
): Promise<Map<string, number>> {
	const rows = await db
		.select({
			accountId: loans.accountId,
			direction: loans.direction,
			principalAmount: loans.principalAmount,
			paidPrincipal: sql<string>`
				coalesce(
					sum(
						case
							when ${transactions.isSettled} = true then ${loanInstallments.principalAmount}
							else 0
						end
					),
					0
				)
			`,
		})
		.from(loans)
		.leftJoin(loanInstallments, eq(loanInstallments.loanId, loans.id))
		.leftJoin(transactions, eq(transactions.id, loanInstallments.transactionId))
		.where(eq(loans.userId, userId))
		.groupBy(loans.accountId, loans.direction, loans.principalAmount);

	const balances = new Map<string, number>();
	for (const row of rows) {
		const principal = toNumber(row.principalAmount);
		const paidPrincipal = toNumber(row.paidPrincipal);
		const remaining = principal - paidPrincipal;
		balances.set(
			row.accountId,
			row.direction === "contratado" ? -remaining : remaining,
		);
	}
	return balances;
}

/**
 * Mesmo cálculo de `fetchLoanOutstandingBalances`, mas pra um único
 * empréstimo e cortado num período específico (usado pela tela de extrato
 * da conta, que navega mês a mês) — considera só parcelas com
 * `transactions.period` antes (`inclusive: false`) ou até (`inclusive:
 * true`) o período informado. `settledOnly: false` ignora `isSettled` (usado
 * pro card de "projetado", igual ao resto do extrato).
 *
 * Retorna `null` quando a conta não tem empréstimo configurado — quem chama
 * deve cair de volta pro cálculo padrão de saldo nesse caso.
 */
export async function fetchLoanBalanceAsOfPeriod(
	userId: string,
	accountId: string,
	period: string,
	{
		inclusive = true,
		settledOnly = true,
	}: { inclusive?: boolean; settledOnly?: boolean } = {},
): Promise<number | null> {
	const periodCutoff = inclusive
		? lte(transactions.period, period)
		: lt(transactions.period, period);
	const withinCutoff = settledOnly
		? and(periodCutoff, eq(transactions.isSettled, true))
		: periodCutoff;

	const [row] = await db
		.select({
			direction: loans.direction,
			principalAmount: loans.principalAmount,
			paidPrincipal: sql<string>`
				coalesce(
					sum(
						case
							when ${withinCutoff} then ${loanInstallments.principalAmount}
							else 0
						end
					),
					0
				)
			`,
		})
		.from(loans)
		.leftJoin(loanInstallments, eq(loanInstallments.loanId, loans.id))
		.leftJoin(transactions, eq(transactions.id, loanInstallments.transactionId))
		.where(and(eq(loans.userId, userId), eq(loans.accountId, accountId)))
		.groupBy(loans.direction, loans.principalAmount);

	if (!row) return null;

	const principal = toNumber(row.principalAmount);
	const paidPrincipal = toNumber(row.paidPrincipal);
	const remaining = principal - paidPrincipal;
	return row.direction === "contratado" ? -remaining : remaining;
}
