import { and, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
	budgets,
	costCenters,
	dailyBudgetSettings,
	financialAccounts,
	transactions,
	userPreferences,
} from "@/db/schema";
import {
	type AvailableBalanceResult,
	calculateAvailableBalance,
} from "@/features/daily-budget/lib/available-balance";
import {
	type AverageDailySpendingResult,
	calculateAverageDailySpending,
} from "@/features/daily-budget/lib/average-spending";
import {
	type BudgetStatusResult,
	evaluateBudgetStatus,
	evaluateIncomeWarning,
	type IncomeWarningResult,
} from "@/features/daily-budget/lib/budget-status-eval";
import {
	calculateDailyBudget,
	type DailyBudgetResult,
} from "@/features/daily-budget/lib/daily-budget";
import {
	type DailyProjectionDayInput,
	generateMultiMonthProjection,
	type MonthProjectionInput,
	type MultiMonthProjectionResult,
} from "@/features/daily-budget/lib/daily-projection";
import {
	calculateMonthProgress,
	type MonthProgress,
} from "@/features/daily-budget/lib/month-progress";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { excludeTransactionsFromExcludedAccounts } from "@/shared/lib/accounts/query-filters";
import type { CostCenterKind } from "@/shared/lib/cost-centers/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import {
	buildDateOnlyStringFromPeriodDay,
	getBusinessDateString,
	parseLocalDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import { addMonthsToPeriod } from "@/shared/utils/period";

const DEFAULT_GREEN_THRESHOLD_PCT = 20;
const DEFAULT_YELLOW_THRESHOLD_PCT = 5;
/** Mês corrente + esse tanto de meses futuros na tabela de projeção. */
const FUTURE_MONTHS_IN_PROJECTION = 2;

export type DailyBudgetOverview = {
	monthProgress: MonthProgress;
	monthlyBudgetTotal: number;
	spentThisMonth: number;
	spentToday: number;
	/** Fatia de `spentToday` que é despesa fixa (já descontada do mês inteiro desde o dia 1º, não conta pro limite diário). */
	fixedSpentToday: number;
	expectedIncome: number;
	calculationMode: "automatico" | "personalizado";
	customDailyLimit: number | null;
	targetSavings: number;
	safetyBuffer: number;
	availableBalance: AvailableBalanceResult["availableBalance"];
	dailyBudget: DailyBudgetResult;
	averageSpending: AverageDailySpendingResult;
	/** null quando não há orçamento configurado pro mês — sem base pra calcular o ritmo. */
	budgetStatus: BudgetStatusResult | null;
	incomeWarning: IncomeWarningResult;
	projection: MultiMonthProjectionResult;
	movements: {
		income: number;
		expenses: number;
		cardExpenses: number;
	};
};

function notAutoInvoiceFilter() {
	return or(
		isNull(transactions.note),
		sql`${transactions.note} NOT LIKE ${`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`}`,
	);
}

/**
 * Soma Receita/Despesa (magnitude positiva) do usuário no período, com o
 * mesmo conjunto de filtros da feature Orçamentos (pagador admin, exclui
 * lançamentos automáticos de fatura, exclui contas não consideradas no
 * saldo — mas card sem conta atrelada continua contando, é despesa real).
 *
 * `costCenterKind` filtra por centro de custo do próprio lançamento (join
 * transactions -> costCenters). Lançamento sem centro de custo definido é
 * tratado como "variavel" — mesmo critério seguro usado no backfill de
 * categorias antigas.
 */
async function fetchExpenseAndIncomeTotals(
	userId: string,
	adminPayerId: string,
	period: string,
	dateFilter?: { op: "lte" | "gt" | "eq"; date: Date },
	costCenterKind?: CostCenterKind,
): Promise<{ income: number; expenses: number }> {
	const conditions = [
		eq(transactions.userId, userId),
		eq(transactions.payerId, adminPayerId),
		eq(transactions.period, period),
		inArray(transactions.transactionType, ["Receita", "Despesa"]),
		notAutoInvoiceFilter(),
		excludeTransactionsFromExcludedAccounts(),
	];

	if (dateFilter) {
		const { op, date } = dateFilter;
		conditions.push(
			op === "lte"
				? lte(transactions.purchaseDate, date)
				: op === "gt"
					? gt(transactions.purchaseDate, date)
					: eq(transactions.purchaseDate, date),
		);
	}

	if (costCenterKind === "variavel") {
		conditions.push(
			or(isNull(transactions.costCenterId), eq(costCenters.kind, "variavel")),
		);
	} else if (costCenterKind) {
		conditions.push(eq(costCenters.kind, costCenterKind));
	}

	const rows = await db
		.select({
			transactionType: transactions.transactionType,
			total: sql<string>`sum(${transactions.amount})`,
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.leftJoin(costCenters, eq(transactions.costCenterId, costCenters.id))
		.where(and(...conditions))
		.groupBy(transactions.transactionType);

	let income = 0;
	let expenses = 0;
	for (const row of rows) {
		const total = safeToNumber(row.total);
		if (row.transactionType === "Receita") income = total;
		// Despesa é gravada com valor negativo — magnitude positiva = -total.
		if (row.transactionType === "Despesa") expenses = -total;
	}

	return { income, expenses };
}

async function fetchDailyMovementRows(
	userId: string,
	adminPayerId: string,
	period: string,
): Promise<DailyProjectionDayInput[]> {
	const rows = await db
		.select({
			date: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			total: sql<string>`sum(${transactions.amount})`,
		})
		.from(transactions)
		.leftJoin(
			financialAccounts,
			eq(transactions.accountId, financialAccounts.id),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				eq(transactions.period, period),
				inArray(transactions.transactionType, ["Receita", "Despesa"]),
				notAutoInvoiceFilter(),
				excludeTransactionsFromExcludedAccounts(),
			),
		)
		.groupBy(transactions.purchaseDate, transactions.transactionType);

	const byDate = new Map<string, { income: number; expenses: number }>();
	for (const row of rows) {
		const dateKey = toDateOnlyString(row.date);
		if (!dateKey) continue;
		const entry = byDate.get(dateKey) ?? { income: 0, expenses: 0 };
		const total = safeToNumber(row.total);
		if (row.transactionType === "Receita") entry.income = total;
		if (row.transactionType === "Despesa") entry.expenses = -total;
		byDate.set(dateKey, entry);
	}

	return Array.from(byDate.entries()).map(([date, value]) => ({
		date,
		...value,
	}));
}

async function fetchCardExpensesToday(
	userId: string,
	adminPayerId: string,
	todayDate: Date,
): Promise<number> {
	const [row] = await db
		.select({ total: sql<string>`sum(${transactions.amount})` })
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				eq(transactions.transactionType, "Despesa"),
				eq(transactions.purchaseDate, todayDate),
				sql`${transactions.cardId} is not null`,
			),
		);

	return row?.total ? -safeToNumber(row.total) : 0;
}

/** Soma dos orçamentos criados (feature Orçamentos), por período, pra vários meses de uma vez. */
async function fetchMonthlyBudgetTotals(
	userId: string,
	periods: string[],
): Promise<Map<string, number>> {
	const rows = await db
		.select({ period: budgets.period, amount: budgets.amount })
		.from(budgets)
		.where(and(eq(budgets.userId, userId), inArray(budgets.period, periods)));

	const totals = new Map<string, number>();
	for (const row of rows) {
		totals.set(
			row.period,
			(totals.get(row.period) ?? 0) + safeToNumber(row.amount),
		);
	}
	return totals;
}

async function fetchSettings(userId: string, period: string) {
	const [row] = await db
		.select({
			calculationMode: dailyBudgetSettings.calculationMode,
			customDailyLimit: dailyBudgetSettings.customDailyLimit,
			targetSavings: dailyBudgetSettings.targetSavings,
			safetyBuffer: dailyBudgetSettings.safetyBuffer,
		})
		.from(dailyBudgetSettings)
		.where(
			and(
				eq(dailyBudgetSettings.userId, userId),
				eq(dailyBudgetSettings.period, period),
			),
		)
		.limit(1);

	return {
		calculationMode: (row?.calculationMode ?? "automatico") as
			| "automatico"
			| "personalizado",
		customDailyLimit:
			row?.customDailyLimit !== null && row?.customDailyLimit !== undefined
				? safeToNumber(row.customDailyLimit)
				: null,
		targetSavings:
			row?.targetSavings !== null && row?.targetSavings !== undefined
				? safeToNumber(row.targetSavings)
				: 0,
		safetyBuffer:
			row?.safetyBuffer !== null && row?.safetyBuffer !== undefined
				? safeToNumber(row.safetyBuffer)
				: 0,
	};
}

async function fetchThresholds(userId: string) {
	const [row] = await db
		.select({
			green: userPreferences.dailyBudgetGreenThresholdPct,
			yellow: userPreferences.dailyBudgetYellowThresholdPct,
		})
		.from(userPreferences)
		.where(eq(userPreferences.userId, userId))
		.limit(1);

	return {
		greenThresholdPct: row?.green ?? DEFAULT_GREEN_THRESHOLD_PCT,
		yellowThresholdPct: row?.yellow ?? DEFAULT_YELLOW_THRESHOLD_PCT,
	};
}

function buildEmptyOverview(monthProgress: MonthProgress): DailyBudgetOverview {
	return {
		monthProgress,
		monthlyBudgetTotal: 0,
		spentThisMonth: 0,
		spentToday: 0,
		fixedSpentToday: 0,
		expectedIncome: 0,
		calculationMode: "automatico",
		customDailyLimit: null,
		targetSavings: 0,
		safetyBuffer: 0,
		availableBalance: 0,
		dailyBudget: {
			dailyBudgetAmount: 0,
			remainingToday: 0,
			isDeficit: false,
			personalizedLimitRisksNegativeBalance: false,
		},
		averageSpending: { averageDailySpending: 0 },
		budgetStatus: null,
		incomeWarning: { isOverIncome: false, difference: 0 },
		projection: { months: [] },
		movements: { income: 0, expenses: 0, cardExpenses: 0 },
	};
}

export async function fetchDailyBudgetOverview(
	userId: string,
): Promise<DailyBudgetOverview> {
	const today = getBusinessDateString();
	const todayDate = parseLocalDateString(today);
	const monthProgress = calculateMonthProgress({ today });
	const { period } = monthProgress;

	const adminPayerId = await getAdminPayerId(userId);
	if (!adminPayerId) {
		return buildEmptyOverview(monthProgress);
	}

	const projectionPeriods = Array.from(
		{ length: FUTURE_MONTHS_IN_PROJECTION + 1 },
		(_, index) => addMonthsToPeriod(period, index),
	);

	const [
		budgetTotals,
		settings,
		thresholds,
		fixedSpentSoFar,
		fixedFutureKnown,
		fixedSpentToday,
		variableSpentSoFar,
		variableFutureKnown,
		variableSpentToday,
		wholeMonth,
		cardExpensesToday,
		dailyRowsPerPeriod,
	] = await Promise.all([
		fetchMonthlyBudgetTotals(userId, projectionPeriods),
		fetchSettings(userId, period),
		fetchThresholds(userId),
		fetchExpenseAndIncomeTotals(
			userId,
			adminPayerId,
			period,
			{ op: "lte", date: todayDate },
			"fixa",
		),
		fetchExpenseAndIncomeTotals(
			userId,
			adminPayerId,
			period,
			{ op: "gt", date: todayDate },
			"fixa",
		),
		fetchExpenseAndIncomeTotals(
			userId,
			adminPayerId,
			period,
			{ op: "eq", date: todayDate },
			"fixa",
		),
		fetchExpenseAndIncomeTotals(
			userId,
			adminPayerId,
			period,
			{ op: "lte", date: todayDate },
			"variavel",
		),
		fetchExpenseAndIncomeTotals(
			userId,
			adminPayerId,
			period,
			{ op: "gt", date: todayDate },
			"variavel",
		),
		fetchExpenseAndIncomeTotals(
			userId,
			adminPayerId,
			period,
			{ op: "eq", date: todayDate },
			"variavel",
		),
		fetchExpenseAndIncomeTotals(userId, adminPayerId, period),
		fetchCardExpensesToday(userId, adminPayerId, todayDate),
		Promise.all(
			projectionPeriods.map((p) =>
				fetchDailyMovementRows(userId, adminPayerId, p),
			),
		),
	]);

	const monthlyBudgetTotal = budgetTotals.get(period) ?? 0;
	// Despesa fixa pré-alocada do mês inteiro (passado + futuro) — pagar a
	// conta em qualquer dia não muda a cota diária, ela já saiu do saldo.
	const totalFixedThisMonth =
		fixedSpentSoFar.expenses + fixedFutureKnown.expenses;
	// Total real já gasto (fixo + variável, purchaseDate <= hoje) — usado só
	// pra exibição/ritmo do mês, não entra na cota diária.
	const spentThisMonth = fixedSpentSoFar.expenses + variableSpentSoFar.expenses;
	const spentToday = fixedSpentToday.expenses + variableSpentToday.expenses;
	const expectedIncome = wholeMonth.income;

	const availableBalanceResult = calculateAvailableBalance({
		monthlyBudgetTotal,
		totalFixedThisMonth,
		variableSpentSoFar: variableSpentSoFar.expenses,
		variableFutureKnown: variableFutureKnown.expenses,
		targetSavings: settings.targetSavings,
		safetyBuffer: settings.safetyBuffer,
	});

	const dailyBudget = calculateDailyBudget({
		availableBalance: availableBalanceResult.availableBalance,
		daysRemaining: monthProgress.daysRemaining,
		calculationMode: settings.calculationMode,
		customDailyLimit: settings.customDailyLimit,
		// Só o gasto variável de hoje conta pro limite do dia — o fixo já foi
		// pré-alocado do saldo do mês inteiro, não importa quando é pago.
		spentToday: variableSpentToday.expenses,
	});

	const averageSpending = calculateAverageDailySpending({
		totalVariableSpentThisCycle: variableSpentSoFar.expenses,
		daysElapsedInCycle: monthProgress.daysElapsed,
	});

	const budgetStatus =
		monthlyBudgetTotal > 0
			? evaluateBudgetStatus({
					daysElapsed: monthProgress.daysElapsed,
					daysInMonth: monthProgress.daysInMonth,
					monthlyBudgetTotal,
					spentThisMonth,
					greenThresholdPct: thresholds.greenThresholdPct,
					yellowThresholdPct: thresholds.yellowThresholdPct,
				})
			: null;

	const incomeWarning = evaluateIncomeWarning({
		monthlyBudgetTotal,
		expectedIncome,
	});

	const monthInputs: MonthProjectionInput[] = projectionPeriods.map(
		(p, index) => {
			const ownTotal = budgetTotals.get(p);
			const isEstimated =
				index > 0 && (ownTotal === undefined || ownTotal === 0);
			const periodBudgetTotal = isEstimated
				? monthlyBudgetTotal
				: (ownTotal ?? 0);
			const monthStart = buildDateOnlyStringFromPeriodDay(p, 1) ?? `${p}-01`;
			const monthEnd = buildDateOnlyStringFromPeriodDay(p, 31) ?? monthStart;
			const daysInThatMonth =
				index === 0
					? monthProgress.daysInMonth
					: new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0).getDate();

			return {
				period: p,
				monthStart,
				monthEnd,
				today,
				monthlyBudgetTotal: periodBudgetTotal,
				dailyBudgetAmount:
					index === 0
						? dailyBudget.dailyBudgetAmount
						: periodBudgetTotal / daysInThatMonth,
				daysWithKnownData: dailyRowsPerPeriod[index] ?? [],
				isEstimated,
			};
		},
	);

	const projection = generateMultiMonthProjection({ months: monthInputs });

	return {
		monthProgress,
		monthlyBudgetTotal,
		spentThisMonth,
		spentToday,
		fixedSpentToday: fixedSpentToday.expenses,
		expectedIncome,
		calculationMode: settings.calculationMode,
		customDailyLimit: settings.customDailyLimit,
		targetSavings: settings.targetSavings,
		safetyBuffer: settings.safetyBuffer,
		availableBalance: availableBalanceResult.availableBalance,
		dailyBudget,
		averageSpending,
		budgetStatus,
		incomeWarning,
		projection,
		movements: {
			income: expectedIncome,
			expenses:
				spentThisMonth +
				fixedFutureKnown.expenses +
				variableFutureKnown.expenses,
			cardExpenses: cardExpensesToday,
		},
	};
}
