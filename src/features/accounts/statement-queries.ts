import { and, eq, lt, type SQL, sql } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import {
	fetchTransactionsPageWithRelations,
	fetchTransactionsWithRelations,
} from "@/features/transactions/queries";
import {
	INITIAL_BALANCE_NOTE,
	REFUND_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";

type AccountSummaryData = {
	openingBalance: number;
	currentBalance: number;
	totalIncomes: number;
	totalExpenses: number;
};

export async function fetchAccountData(userId: string, accountId: string) {
	const account = await db.query.financialAccounts.findFirst({
		columns: {
			id: true,
			name: true,
			accountType: true,
			status: true,
			initialBalance: true,
			logo: true,
			note: true,
			bankConnectionId: true,
		},
		with: {
			bankConnection: {
				columns: { connectorName: true, nickname: true },
			},
		},
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, userId),
		),
	});

	if (!account) return account;

	const { bankConnection, ...rest } = account;
	return {
		...rest,
		pluggyConnectorName: bankConnection
			? (bankConnection.nickname ?? bankConnection.connectorName)
			: null,
	};
}

export async function fetchAccountSummary(
	userId: string,
	accountId: string,
	selectedPeriod: string,
	{ settledOnly = true }: { settledOnly?: boolean } = {},
): Promise<AccountSummaryData> {
	const account = await fetchAccountData(userId, accountId);
	if (!account) {
		throw new Error("Account not found");
	}

	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		const initialBalance = Number(account.initialBalance ?? 0);
		return {
			openingBalance: initialBalance,
			currentBalance: initialBalance,
			totalIncomes: 0,
			totalExpenses: 0,
		};
	}

	const settledCondition = settledOnly
		? [eq(transactions.isSettled, true)]
		: [];

	const [periodSummary] = await db
		.select({
			netAmount: sql<number>`
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
			incomes: sql<number>`
        coalesce(
          sum(
            case
              when ${transactions.note} = ${INITIAL_BALANCE_NOTE} then 0
              when ${transactions.note} ilike ${`${REFUND_NOTE_PREFIX}%`} then 0
              when ${transactions.transactionType} = 'Receita' then ${transactions.amount}
              when ${transactions.transactionType} = 'Transferência' and ${transactions.amount} > 0 then ${transactions.amount}
              else 0
            end
          ),
          0
        )
      `,
			expenses: sql<number>`
        coalesce(
          sum(
            case
              when ${transactions.note} = ${INITIAL_BALANCE_NOTE} then 0
              when ${transactions.note} ilike ${`${REFUND_NOTE_PREFIX}%`} then abs(${transactions.amount})
              when ${transactions.transactionType} = 'Despesa' then ${transactions.amount}
              when ${transactions.transactionType} = 'Transferência' and ${transactions.amount} < 0 then ${transactions.amount}
              else 0
            end
          ),
          0
        )
      `,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.accountId, accountId),
				eq(transactions.period, selectedPeriod),
				eq(transactions.payerId, adminPayerId),
				...settledCondition,
			),
		);

	const [previousRow] = await db
		.select({
			previousMovements: sql<number>`
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
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.accountId, accountId),
				lt(transactions.period, selectedPeriod),
				eq(transactions.payerId, adminPayerId),
				...settledCondition,
			),
		);

	const initialBalance = Number(account.initialBalance ?? 0);
	const previousMovements = Number(previousRow?.previousMovements ?? 0);
	const netAmount = Number(periodSummary?.netAmount ?? 0);
	const totalIncomes = Number(periodSummary?.incomes ?? 0);
	const expenseNet = Number(periodSummary?.expenses ?? 0);
	const totalExpenses = Math.max(0, -expenseNet);

	const openingBalance = initialBalance + previousMovements;
	const currentBalance = openingBalance + netAmount;

	return {
		openingBalance,
		currentBalance,
		totalIncomes,
		totalExpenses,
	};
}

/**
 * Saldo da conta logo após cada lançamento confirmado do período — pra
 * mostrar "quanto tinha na conta naquele dia" no extrato. Só faz sentido
 * pras transações realmente liquidadas (`isSettled`) — pendente/agendado
 * ainda não afetou o saldo de verdade.
 *
 * Calcula com uma soma cumulativa em janela SQL, ordenada cronologicamente
 * (independente da ordem de exibição da tabela, que é mais recente
 * primeiro), somada ao saldo de abertura do período — o mesmo usado no
 * card de resumo, então o saldo do dia do extrato bate com aquele número.
 */
export async function fetchAccountRunningBalances(
	userId: string,
	accountId: string,
	selectedPeriod: string,
	openingBalance: number,
): Promise<Map<string, number>> {
	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) return new Map();

	const rows = await db
		.select({
			id: transactions.id,
			cumulative: sql<string>`
				sum(
					case
						when ${transactions.note} = ${INITIAL_BALANCE_NOTE} then 0
						else ${transactions.amount}
					end
				) over (
					order by ${transactions.purchaseDate} asc, ${transactions.createdAt} asc
				)
			`,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.accountId, accountId),
				eq(transactions.period, selectedPeriod),
				eq(transactions.payerId, adminPayerId),
				eq(transactions.isSettled, true),
			),
		);

	const balanceById = new Map<string, number>();
	for (const row of rows) {
		balanceById.set(row.id, openingBalance + Number(row.cumulative));
	}
	return balanceById;
}

export async function fetchAccountTransactions(
	filters: SQL[],
	settledOnly = true,
) {
	const extraFilters = settledOnly ? [eq(transactions.isSettled, true)] : [];

	return fetchTransactionsWithRelations({
		filters,
		extraFilters,
		excludeInitialBalanceFromIncome: false,
	});
}

export async function fetchAccountTransactionsPage(
	filters: SQL[],
	{
		page,
		pageSize,
	}: {
		page: number;
		pageSize: number;
	},
	settledOnly = true,
) {
	const extraFilters = settledOnly ? [eq(transactions.isSettled, true)] : [];

	return fetchTransactionsPageWithRelations({
		filters,
		extraFilters,
		excludeInitialBalanceFromIncome: false,
		page,
		pageSize,
	});
}
