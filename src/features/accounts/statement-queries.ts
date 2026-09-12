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
import { isLoanAccountType } from "@/shared/lib/loans/constants";
import { buildAccountTransactionCondition } from "@/shared/lib/loans/linked-transactions";
import { fetchLoanBalanceAsOfPeriod } from "@/shared/lib/loans/outstanding-balance";
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
				buildAccountTransactionCondition(accountId),
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
				buildAccountTransactionCondition(accountId),
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

	// Conta de empréstimo: saldo não é a soma dos lançamentos (que incluem
	// juros, e ficariam fora da amortização), e sim o saldo devedor/recebível
	// derivado das parcelas — mesmo princípio de `fetchLoanOutstandingBalances`
	// usado na listagem de contas, só que cortado no período navegado aqui.
	let openingBalance = initialBalance + previousMovements;
	let currentBalance = openingBalance + netAmount;

	if (isLoanAccountType(account.accountType)) {
		const [openingLoanBalance, closingLoanBalance] = await Promise.all([
			fetchLoanBalanceAsOfPeriod(userId, accountId, selectedPeriod, {
				inclusive: false,
				settledOnly,
			}),
			fetchLoanBalanceAsOfPeriod(userId, accountId, selectedPeriod, {
				inclusive: true,
				settledOnly,
			}),
		]);

		if (openingLoanBalance !== null && closingLoanBalance !== null) {
			openingBalance = openingLoanBalance;
			currentBalance = closingLoanBalance;
		}
	}

	return {
		openingBalance,
		currentBalance,
		totalIncomes,
		totalExpenses,
	};
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
