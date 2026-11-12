import { and, eq, inArray, sql } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import {
	INITIAL_BALANCE_NOTE,
	isAccountInactive,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { toDateOnlyString } from "@/shared/utils/date";
import { safeToNumber as toNumber } from "@/shared/utils/number";

/**
 * Contrato cruza domínio: `fetchDashboardAccounts` é consumida hoje por
 * dashboard, daily-budget, savings-goals, bank-sync, diary, reports e mcp —
 * mora em `shared/` por decisão do AGENTS.md ("se um contrato cruza domínio,
 * ele deve morar em shared"). `features/dashboard/lib/accounts-queries.ts`
 * re-exporta este módulo para não quebrar nenhum import existente.
 */

type RawDashboardAccount = {
	id: string;
	name: string;
	accountType: string;
	status: string;
	logo: string | null;
	initialBalance: string | number | null;
	balanceMovements: unknown;
};

export type DashboardAccount = {
	id: string;
	name: string;
	accountType: string;
	status: string;
	logo: string | null;
	initialBalance: number;
	balance: number;
	excludeFromBalance: boolean;
	pluggyBalance: number | null;
};

export type DashboardAccountsSnapshot = {
	totalBalance: number;
	accounts: DashboardAccount[];
};

/**
 * Condição de junção dos lançamentos que movimentam o saldo de uma conta.
 *
 * Não filtra por pagador: o dinheiro sai (ou entra) na conta de qualquer jeito,
 * mesmo quando o lançamento pertence a outra pessoa (rateio, despesa da
 * Lauane paga na conta do titular). Filtrar só o pagador admin deixava o saldo
 * do app maior que o do extrato.
 */
export const buildAccountMovementsJoin = (userId: string) =>
	and(
		eq(transactions.accountId, financialAccounts.id),
		eq(transactions.userId, userId),
		eq(transactions.isSettled, true),
	);

export async function fetchDashboardAccounts(
	userId: string,
): Promise<DashboardAccountsSnapshot> {
	const rows = await db
		.select({
			id: financialAccounts.id,
			name: financialAccounts.name,
			accountType: financialAccounts.accountType,
			status: financialAccounts.status,
			logo: financialAccounts.logo,
			initialBalance: financialAccounts.initialBalance,
			excludeFromBalance: financialAccounts.excludeFromBalance,
			pluggyBalance: financialAccounts.pluggyBalance,
			balanceMovements: sql<number>`
        coalesce(
          sum(
            case
              when ${transactions.note} = ${INITIAL_BALANCE_NOTE} then 0
              else ${transactions.amount}
            end
          ),
          0
        )
      `,
		})
		.from(financialAccounts)
		.leftJoin(transactions, buildAccountMovementsJoin(userId))
		.where(eq(financialAccounts.userId, userId))
		.groupBy(
			financialAccounts.id,
			financialAccounts.name,
			financialAccounts.accountType,
			financialAccounts.status,
			financialAccounts.logo,
			financialAccounts.initialBalance,
			financialAccounts.excludeFromBalance,
			financialAccounts.pluggyBalance,
		);

	const accounts = rows
		.map(
			(
				row: RawDashboardAccount & {
					excludeFromBalance: boolean;
					pluggyBalance: string | null;
				},
			): DashboardAccount => {
				const initialBalance = toNumber(row.initialBalance);
				const balanceMovements = toNumber(row.balanceMovements);

				return {
					id: row.id,
					name: row.name,
					accountType: row.accountType,
					status: row.status,
					logo: row.logo,
					initialBalance,
					balance: initialBalance + balanceMovements,
					excludeFromBalance: row.excludeFromBalance,
					pluggyBalance:
						row.pluggyBalance === null ? null : toNumber(row.pluggyBalance),
				};
			},
		)
		.sort((a, b) => b.balance - a.balance);

	const totalBalance = accounts
		.filter(
			(account) =>
				!account.excludeFromBalance && !isAccountInactive(account.status),
		)
		.reduce((total, account) => total + account.balance, 0);

	return {
		totalBalance,
		accounts,
	};
}

/**
 * Fluxo líquido diário (soma de `amount`, já com sinal — Despesa é
 * negativa) de lançamentos REALIZADOS que entram em `totalBalance` acima.
 *
 * Espelha exatamente o mesmo filtro de `fetchDashboardAccounts`: mesmo
 * `isSettled = true`, qualquer pagador (o saldo é da conta), mesma exclusão da
 * nota de saldo inicial, mesma exclusão de conta com `excludeFromBalance`
 * ou inativa. É usada por `src/features/balances` para desfazer/refazer
 * lançamentos realizados ao redor de `totalBalance` (que não tem filtro de
 * data — inclui qualquer lançamento realizado, passado ou futuro) e assim
 * calcular o saldo real em qualquer dia da janela projetada, sem só
 * assumir que "hoje" é o começo da projeção.
 *
 * Nunca alterar um filtro aqui sem replicar em `fetchDashboardAccounts` —
 * as duas precisam concordar ou a âncora da projeção diverge do saldo
 * consolidado mostrado no dashboard.
 */
export async function fetchSettledNetByDate(
	userId: string,
): Promise<Map<string, number>> {
	const accounts = await db
		.select({
			id: financialAccounts.id,
			status: financialAccounts.status,
			excludeFromBalance: financialAccounts.excludeFromBalance,
		})
		.from(financialAccounts)
		.where(eq(financialAccounts.userId, userId));

	const eligibleAccountIds = accounts
		.filter(
			(account) =>
				!account.excludeFromBalance && !isAccountInactive(account.status),
		)
		.map((account) => account.id);

	if (eligibleAccountIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			date: transactions.purchaseDate,
			total: sql<string>`sum(${transactions.amount})`,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.isSettled, true),
				inArray(transactions.accountId, eligibleAccountIds),
				sql`${transactions.note} is distinct from ${INITIAL_BALANCE_NOTE}`,
			),
		)
		.groupBy(transactions.purchaseDate);

	const net = new Map<string, number>();
	for (const row of rows) {
		const dateKey = toDateOnlyString(row.date);
		if (!dateKey) continue;
		net.set(dateKey, (net.get(dateKey) ?? 0) + toNumber(row.total));
	}
	return net;
}
