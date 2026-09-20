import { and, eq, inArray, sql } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import {
	INITIAL_BALANCE_NOTE,
	isAccountInactive,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
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
};

export type DashboardAccountsSnapshot = {
	totalBalance: number;
	accounts: DashboardAccount[];
};

export async function fetchDashboardAccounts(
	userId: string,
): Promise<DashboardAccountsSnapshot> {
	const adminPayerId = await getAdminPayerId(userId);

	const rows = await db
		.select({
			id: financialAccounts.id,
			name: financialAccounts.name,
			accountType: financialAccounts.accountType,
			status: financialAccounts.status,
			logo: financialAccounts.logo,
			initialBalance: financialAccounts.initialBalance,
			excludeFromBalance: financialAccounts.excludeFromBalance,
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
		.leftJoin(
			transactions,
			and(
				eq(transactions.accountId, financialAccounts.id),
				eq(transactions.userId, userId),
				eq(transactions.isSettled, true),
				adminPayerId ? eq(transactions.payerId, adminPayerId) : sql`false`,
			),
		)
		.where(eq(financialAccounts.userId, userId))
		.groupBy(
			financialAccounts.id,
			financialAccounts.name,
			financialAccounts.accountType,
			financialAccounts.status,
			financialAccounts.logo,
			financialAccounts.initialBalance,
			financialAccounts.excludeFromBalance,
		);

	const accounts = rows
		.map(
			(
				row: RawDashboardAccount & { excludeFromBalance: boolean },
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
 * `isSettled = true`, mesmo `payerId` do pagador admin, mesma exclusão da
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
	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		return new Map();
	}

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
				eq(transactions.payerId, adminPayerId),
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
