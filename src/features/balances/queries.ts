import {
	and,
	between,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import {
	budgets,
	cards,
	costCenters,
	dailyBudgetSettings,
	financialAccounts,
	invoices,
	transactions,
} from "@/db/schema";
import {
	type BalanceDayMovement,
	type BalanceProjectionResult,
	generateBalanceProjection,
} from "@/features/balances/lib/balance-projection";
import { calculateBalanceDailyAllowance } from "@/features/balances/lib/daily-allowance";
import {
	buildCardDueSchedule,
	type InvoiceDueAggregate,
} from "@/features/balances/lib/invoice-schedule";
import {
	fetchDashboardAccounts,
	fetchSettledNetByDate,
} from "@/shared/lib/accounts/balance-queries";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { excludeTransactionsFromExcludedAccounts } from "@/shared/lib/accounts/query-filters";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import {
	buildDateOnlyStringFromPeriodDay,
	getBusinessDateString,
	parseLocalDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	derivePeriodFromDate,
} from "@/shared/utils/period";

/** Meses na janela padrão da página `/balances` — mês selecionado + 11. */
const MONTHS_IN_WINDOW = 12;

export type BalanceProjectionOverview = {
	windowStart: string;
	windowEnd: string;
	startPeriod: string;
	endPeriod: string;
	today: string;
	projection: BalanceProjectionResult;
	dailyAllowance: number;
	warningThreshold: number;
};

function notAutoInvoiceFilter() {
	return or(
		isNull(transactions.note),
		sql`${transactions.note} NOT LIKE ${`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`}`,
	);
}

function daysInPeriod(period: string): number {
	const [year, month] = period.split("-").map(Number);
	return new Date(year ?? 0, month ?? 0, 0).getDate();
}

function emptyMovement(date: string): BalanceDayMovement {
	return {
		date,
		income: 0,
		fixedExpenses: 0,
		variableExpenses: 0,
		savings: 0,
		cardDue: 0,
	};
}

/**
 * Uma query, batelada por intervalo de data (não por período) — cobre a
 * janela inteira de uma vez, ao contrário do padrão por-período que
 * `daily-budget` usa pros 3 meses dele. Compra no cartão (`cardId` não nulo)
 * fica de fora: ela não sai da conta na data da compra, só quando a fatura
 * vence (ver `fetchWindowInvoices`).
 */
async function fetchDayMovements(
	userId: string,
	adminPayerId: string,
	windowStart: string,
	windowEnd: string,
): Promise<BalanceDayMovement[]> {
	const rows = await db
		.select({
			date: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			kind: costCenters.kind,
			total: sql<string>`sum(${transactions.amount})`,
		})
		.from(transactions)
		.leftJoin(costCenters, eq(transactions.costCenterId, costCenters.id))
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				inArray(transactions.transactionType, ["Receita", "Despesa"]),
				isNull(transactions.cardId),
				between(
					transactions.purchaseDate,
					parseLocalDateString(windowStart),
					parseLocalDateString(windowEnd),
				),
				notAutoInvoiceFilter(),
				excludeTransactionsFromExcludedAccounts(),
			),
		)
		.groupBy(
			transactions.purchaseDate,
			transactions.transactionType,
			costCenters.kind,
		);

	const byDate = new Map<string, BalanceDayMovement>();

	for (const row of rows) {
		const dateKey = toDateOnlyString(row.date);
		if (!dateKey) continue;

		const entry = byDate.get(dateKey) ?? emptyMovement(dateKey);
		const magnitude = Math.abs(safeToNumber(row.total));

		if (row.transactionType === "Receita") {
			entry.income += magnitude;
		} else if (row.kind === "economia") {
			entry.savings += magnitude;
		} else if (row.kind === "fixa") {
			entry.fixedExpenses += magnitude;
		} else {
			// "variavel" ou sem centro de custo — mesmo critério seguro usado no
			// resto do app (ver fetchExpenseAndIncomeTotals em daily-budget).
			entry.variableExpenses += magnitude;
		}

		byDate.set(dateKey, entry);
	}

	return Array.from(byDate.values());
}

/**
 * Uma query pra janela inteira: agrega compras de cartão por (cartão,
 * período), com o mesmo status de pagamento que a tela de faturas usa. O
 * `period` do lançamento já é o mês da fatura (deslocado no fechamento por
 * `deriveCreditCardPeriod`), então a data de vencimento cai sempre dentro
 * desse mesmo período — não precisa consultar um mês a mais.
 */
async function fetchWindowInvoices(
	userId: string,
	adminPayerId: string,
	periods: string[],
): Promise<InvoiceDueAggregate[]> {
	if (periods.length === 0) return [];

	const rows = await db
		.select({
			cardId: cards.id,
			dueDay: cards.dueDay,
			period: transactions.period,
			paymentStatus: invoices.paymentStatus,
			total: sql<string>`sum(${transactions.amount})`,
		})
		.from(transactions)
		.innerJoin(cards, eq(transactions.cardId, cards.id))
		.leftJoin(
			invoices,
			and(
				eq(invoices.userId, userId),
				eq(invoices.cardId, transactions.cardId),
				eq(invoices.period, transactions.period),
			),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				isNotNull(transactions.cardId),
				inArray(transactions.period, periods),
			),
		)
		.groupBy(
			cards.id,
			cards.dueDay,
			transactions.period,
			invoices.paymentStatus,
		);

	return rows.map((row) => ({
		cardId: row.cardId,
		dueDay: row.dueDay,
		period: row.period,
		paymentStatus: row.paymentStatus,
		// Mesmo cálculo de `adminPayableAmount` em invoices/actions.ts: só a
		// cota do pagador admin, nunca a fatura bruta.
		adminTotal: Math.abs(Math.min(safeToNumber(row.total), 0)),
	}));
}

/**
 * Config de `daily-budget` pro mês corrente — mesma fonte de dado, não a
 * mesma pipeline (não reage ao saldo real disponível minuto a minuto).
 */
async function fetchDailyBudgetSettingsSlice(
	userId: string,
	currentPeriod: string,
): Promise<{
	calculationMode: "automatico" | "personalizado";
	customDailyLimit: number | null;
	safetyBuffer: number;
}> {
	const [row] = await db
		.select({
			calculationMode: dailyBudgetSettings.calculationMode,
			customDailyLimit: dailyBudgetSettings.customDailyLimit,
			safetyBuffer: dailyBudgetSettings.safetyBuffer,
		})
		.from(dailyBudgetSettings)
		.where(
			and(
				eq(dailyBudgetSettings.userId, userId),
				eq(dailyBudgetSettings.period, currentPeriod),
			),
		)
		.limit(1);

	return {
		calculationMode:
			row?.calculationMode === "personalizado" ? "personalizado" : "automatico",
		customDailyLimit:
			row?.customDailyLimit !== null && row?.customDailyLimit !== undefined
				? safeToNumber(row.customDailyLimit)
				: null,
		safetyBuffer: safeToNumber(row?.safetyBuffer),
	};
}

/** Soma dos orçamentos criados (feature Orçamentos) pro mês corrente. */
async function fetchMonthlyBudgetTotal(
	userId: string,
	currentPeriod: string,
): Promise<number> {
	const [row] = await db
		.select({ total: sql<string>`coalesce(sum(${budgets.amount}), 0)` })
		.from(budgets)
		.where(and(eq(budgets.userId, userId), eq(budgets.period, currentPeriod)));

	return safeToNumber(row?.total);
}

/**
 * Despesa fixa e variável (ou sem centro de custo) já conhecida do mês
 * corrente INTEIRO (passado + futuro, qualquer que seja a janela sendo
 * visualizada — por isso é uma query própria, não derivada de
 * `fetchDayMovements`, que só cobre a janela selecionada). Alimenta
 * `calculateBalanceDailyAllowance`: se o que já está lançado no mês já
 * ultrapassa o orçamento, a cota pros dias vazios que sobraram precisa ser
 * 0, não um valor positivo que contradiz o "orçamento estourado" que
 * `/daily-budget` já mostra pro mesmo mês.
 */
async function fetchCurrentMonthKnownExpenses(
	userId: string,
	adminPayerId: string,
	currentPeriod: string,
): Promise<{ fixed: number; variable: number }> {
	const rows = await db
		.select({
			kind: costCenters.kind,
			total: sql<string>`sum(${transactions.amount})`,
		})
		.from(transactions)
		.leftJoin(costCenters, eq(transactions.costCenterId, costCenters.id))
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				eq(transactions.transactionType, "Despesa"),
				eq(transactions.period, currentPeriod),
				isNull(transactions.cardId),
			),
		)
		.groupBy(costCenters.kind);

	let fixed = 0;
	let variable = 0;
	for (const row of rows) {
		const magnitude = Math.abs(safeToNumber(row.total));
		if (row.kind === "fixa") {
			fixed += magnitude;
		} else if (row.kind !== "economia") {
			// "variavel" ou sem centro de custo — mesmo critério seguro usado em
			// fetchDayMovements e no resto do app.
			variable += magnitude;
		}
	}
	return { fixed, variable };
}

function mergeCardDue(
	movements: BalanceDayMovement[],
	cardDueSchedule: Map<string, number>,
): BalanceDayMovement[] {
	const byDate = new Map(movements.map((entry) => [entry.date, { ...entry }]));

	for (const [date, cardDue] of cardDueSchedule) {
		const entry = byDate.get(date) ?? emptyMovement(date);
		entry.cardDue += cardDue;
		byDate.set(date, entry);
	}

	return Array.from(byDate.values());
}

function buildEmptyOverview(input: {
	windowStart: string;
	windowEnd: string;
	startPeriod: string;
	endPeriod: string;
	today: string;
}): BalanceProjectionOverview {
	return {
		...input,
		projection: { startingBalance: 0, rows: [] },
		dailyAllowance: 0,
		warningThreshold: 0,
	};
}

export async function fetchBalanceProjection(
	userId: string,
	options?: { startPeriod?: string },
): Promise<BalanceProjectionOverview> {
	const today = getBusinessDateString();
	const currentPeriod = derivePeriodFromDate(today);
	const startPeriod = options?.startPeriod ?? currentPeriod;
	const endPeriod = addMonthsToPeriod(startPeriod, MONTHS_IN_WINDOW - 1);

	const windowStart =
		buildDateOnlyStringFromPeriodDay(startPeriod, 1) ?? `${startPeriod}-01`;
	const windowEnd =
		buildDateOnlyStringFromPeriodDay(endPeriod, 31) ?? windowStart;

	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		return buildEmptyOverview({
			windowStart,
			windowEnd,
			startPeriod,
			endPeriod,
			today,
		});
	}

	const periods = buildPeriodRange(startPeriod, endPeriod);

	const [
		movements,
		settledNetByDate,
		invoiceRows,
		accountsSnapshot,
		settingsSlice,
		monthlyBudgetTotal,
		knownExpenses,
	] = await Promise.all([
		fetchDayMovements(userId, adminPayerId, windowStart, windowEnd),
		fetchSettledNetByDate(userId),
		fetchWindowInvoices(userId, adminPayerId, periods),
		fetchDashboardAccounts(userId),
		fetchDailyBudgetSettingsSlice(userId, currentPeriod),
		fetchMonthlyBudgetTotal(userId, currentPeriod),
		fetchCurrentMonthKnownExpenses(userId, adminPayerId, currentPeriod),
	]);

	const cardDueSchedule = buildCardDueSchedule(invoiceRows);
	const movementsWithCard = mergeCardDue(movements, cardDueSchedule);

	const dailyAllowance = calculateBalanceDailyAllowance({
		calculationMode: settingsSlice.calculationMode,
		customDailyLimit: settingsSlice.customDailyLimit,
		monthlyBudgetTotal,
		fixedThisMonth: knownExpenses.fixed,
		variableKnownThisMonth: knownExpenses.variable,
		daysInMonth: daysInPeriod(currentPeriod),
	});

	const projection = generateBalanceProjection({
		windowStart,
		windowEnd,
		today,
		anchorBalance: accountsSnapshot.totalBalance,
		settledNetByDate,
		movements: movementsWithCard,
		dailyAllowance,
	});

	const warningThreshold =
		settingsSlice.safetyBuffer || dailyAllowance * 7 || 0;

	return {
		windowStart,
		windowEnd,
		startPeriod,
		endPeriod,
		today,
		projection,
		dailyAllowance,
		warningThreshold,
	};
}
