import { and, eq } from "drizzle-orm";
import {
	budgets,
	diaryAchievements,
	type diaryEntries,
	diaryStreaks,
} from "@/db/schema";
import {
	BADGE_DEFINITIONS,
	type BadgeDefinition,
	evaluatePendingMonthBadges,
} from "@/features/diary/lib/achievements";
import {
	computeDayStatuses,
	type DiaryDayStatus,
} from "@/features/diary/lib/calendar-status";
import {
	DIARY_REMINDER_DEFAULT_TIME,
	DIARY_ROLLING_AVERAGE_WINDOW_DAYS,
} from "@/features/diary/lib/constants";
import { resolveDisplayStreak } from "@/features/diary/lib/streak";
import {
	addDays,
	getIsoWeekLabel,
	getWeekDays,
	getWeekStart,
} from "@/features/diary/lib/week";
import { computeWeeklySummary } from "@/features/diary/lib/weekly-summary";
import { db } from "@/shared/lib/db";
import {
	getBusinessDateString,
	getBusinessTodayDate,
	parseLocalDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { safeToNumber } from "@/shared/utils/number";
import { dateToPeriod, parsePeriod } from "@/shared/utils/period";

export const DIARY_WEEKLY_SUMMARY_NOTIFICATION_KEY = "diary-weekly-summary";

export type DiaryEntryData = {
	id: string;
	entryDate: string;
	hadExpense: boolean;
	amount: number | null;
	category: string | null;
	classification: string | null;
	note: string | null;
};

function toDiaryEntryData(
	row: typeof diaryEntries.$inferSelect,
): DiaryEntryData {
	return {
		id: row.id,
		entryDate: toDateOnlyString(row.entryDate) ?? "",
		hadExpense: row.hadExpense,
		amount: row.amount !== null ? safeToNumber(row.amount) : null,
		category: row.category,
		classification: row.classification,
		note: row.note,
	};
}

export async function fetchTodayEntry(
	userId: string,
): Promise<DiaryEntryData | null> {
	const todayDate = getBusinessTodayDate();

	const row = await db.query.diaryEntries.findFirst({
		where: (table, { and, eq }) =>
			and(eq(table.userId, userId), eq(table.entryDate, todayDate)),
	});

	return row ? toDiaryEntryData(row) : null;
}

export type StreakSummary = {
	currentStreak: number;
	longestStreak: number;
	hasCheckedInToday: boolean;
	isBrokenSinceLastEntry: boolean;
};

export async function fetchStreakSummary(
	userId: string,
): Promise<StreakSummary> {
	const today = getBusinessDateString();

	const row = await db.query.diaryStreaks.findFirst({
		where: eq(diaryStreaks.userId, userId),
	});

	return resolveDisplayStreak(
		{
			currentStreak: row?.currentStreak ?? 0,
			longestStreak: row?.longestStreak ?? 0,
			lastEntryDate: toDateOnlyString(row?.lastEntryDate ?? null),
		},
		today,
	);
}

export type DiaryCalendarData = {
	entries: DiaryEntryData[];
	statuses: Record<string, DiaryDayStatus>;
};

function buildDaysInPeriod(period: string): string[] {
	const { year, month } = parsePeriod(period);
	const daysInMonth = new Date(year, month, 0).getDate();

	return Array.from({ length: daysInMonth }, (_, index) => {
		const day = index + 1;
		return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	});
}

/** Média de gasto diário nos últimos 30 dias (só dias com gasto), usada pelo amarelo. */
async function fetchRollingAverageDailySpend(
	userId: string,
	todayDate: Date,
): Promise<number | null> {
	const rollingWindowStart = new Date(todayDate);
	rollingWindowStart.setDate(
		rollingWindowStart.getDate() - (DIARY_ROLLING_AVERAGE_WINDOW_DAYS - 1),
	);

	const rows = await db.query.diaryEntries.findMany({
		where: (table, { and, eq, gte, lte }) =>
			and(
				eq(table.userId, userId),
				eq(table.hadExpense, true),
				gte(table.entryDate, rollingWindowStart),
				lte(table.entryDate, todayDate),
			),
		columns: { amount: true },
	});

	const amounts = rows
		.map((row) => (row.amount !== null ? safeToNumber(row.amount) : null))
		.filter((amount): amount is number => amount !== null);

	return amounts.length > 0
		? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
		: null;
}

/** Limite único global (R$/dia) configurado pelo usuário; null = sem limite. */
async function fetchDailyBudgetAmount(userId: string): Promise<number | null> {
	const row = await db.query.diaryStreaks.findFirst({
		where: eq(diaryStreaks.userId, userId),
		columns: { dailyBudgetAmount: true },
	});

	return row?.dailyBudgetAmount !== null && row?.dailyBudgetAmount !== undefined
		? safeToNumber(row.dailyBudgetAmount)
		: null;
}

/** Soma dos orçamentos mensais (feature Orçamentos) para o período; null se não há nenhum. */
async function fetchMonthlyBudgetTotal(
	userId: string,
	period: string,
): Promise<number | null> {
	const rows = await db
		.select({ amount: budgets.amount })
		.from(budgets)
		.where(and(eq(budgets.userId, userId), eq(budgets.period, period)));

	return rows.length > 0
		? rows.reduce((sum, row) => sum + safeToNumber(row.amount), 0)
		: null;
}

export async function fetchDiaryCalendarData({
	userId,
	period,
}: {
	userId: string;
	period: string;
}): Promise<DiaryCalendarData> {
	const { year, month } = parsePeriod(period);
	const monthIndex = month - 1;
	const rangeStart = new Date(year, monthIndex, 1);
	const rangeEnd = new Date(year, monthIndex + 1, 0);
	const todayDate = getBusinessTodayDate();

	const [
		monthRows,
		rollingAverageDailySpend,
		dailyBudgetAmount,
		monthlyBudgetTotal,
	] = await Promise.all([
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					gte(table.entryDate, rangeStart),
					lte(table.entryDate, rangeEnd),
				),
		}),
		fetchRollingAverageDailySpend(userId, todayDate),
		fetchDailyBudgetAmount(userId),
		fetchMonthlyBudgetTotal(userId, period),
	]);

	const entries = monthRows.map(toDiaryEntryData);

	const statuses = computeDayStatuses({
		daysInPeriod: buildDaysInPeriod(period),
		entries: entries.map((entry) => ({
			entryDate: entry.entryDate,
			hadExpense: entry.hadExpense,
			amount: entry.amount,
		})),
		rollingAverageDailySpend,
		dailyBudgetAmount,
		monthlyBudgetTotal,
	});

	return { entries, statuses };
}

export type DiaryWeekDayData = {
	date: string;
	status: DiaryDayStatus;
	entry: DiaryEntryData | null;
};

export type DiaryWeekData = {
	weekStart: string;
	days: DiaryWeekDayData[];
};

/**
 * Sem orçamento diário definido, o vermelho cai no fallback de acumulado
 * mensal — mas aqui o acumulado é reiniciado no início da semana exibida
 * (não do mês), então pode divergir levemente do que a visão mensal mostra
 * pro mesmo dia perto da virada do mês. Isso é uma aproximação aceitável do
 * caminho secundário: definir um orçamento diário (o recomendado) já
 * elimina essa ambiguidade, já que a regra deixa de ser cumulativa.
 */
export async function fetchDiaryWeekData({
	userId,
	weekStart,
}: {
	userId: string;
	weekStart: string;
}): Promise<DiaryWeekData> {
	const weekDays = getWeekDays(weekStart);
	const weekEnd = addDays(weekStart, 6);
	const rangeStart = parseLocalDateString(weekStart);
	const rangeEnd = parseLocalDateString(weekEnd);
	const todayDate = getBusinessTodayDate();
	const period = dateToPeriod(rangeStart);

	const [
		weekRows,
		rollingAverageDailySpend,
		dailyBudgetAmount,
		monthlyBudgetTotal,
	] = await Promise.all([
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					gte(table.entryDate, rangeStart),
					lte(table.entryDate, rangeEnd),
				),
		}),
		fetchRollingAverageDailySpend(userId, todayDate),
		fetchDailyBudgetAmount(userId),
		fetchMonthlyBudgetTotal(userId, period),
	]);

	const entries = weekRows.map(toDiaryEntryData);
	const entriesByDate = new Map(
		entries.map((entry) => [entry.entryDate, entry]),
	);

	const statuses = computeDayStatuses({
		daysInPeriod: weekDays,
		entries: entries.map((entry) => ({
			entryDate: entry.entryDate,
			hadExpense: entry.hadExpense,
			amount: entry.amount,
		})),
		rollingAverageDailySpend,
		dailyBudgetAmount,
		monthlyBudgetTotal,
	});

	return {
		weekStart,
		days: weekDays.map((date) => ({
			date,
			status: statuses[date] ?? "gray",
			entry: entriesByDate.get(date) ?? null,
		})),
	};
}

function sumExpenses(
	rows: Array<{ hadExpense: boolean; amount: string | null }>,
) {
	return rows.reduce(
		(sum, row) => sum + (row.hadExpense ? safeToNumber(row.amount) : 0),
		0,
	);
}

export type WeeklySummary = {
	daysLogged: number;
	totalSpent: number;
	comparisonPct: number | null;
	message: string;
	notificationKey: string;
	fingerprint: string;
	isDismissed: boolean;
};

export async function fetchWeeklySummary(
	userId: string,
): Promise<WeeklySummary> {
	const today = getBusinessDateString();
	const thisWeekStartStr = getWeekStart(today);
	const thisWeekStart = parseLocalDateString(thisWeekStartStr);
	const thisWeekEnd = parseLocalDateString(addDays(thisWeekStartStr, 6));
	const lastWeekStart = parseLocalDateString(addDays(thisWeekStartStr, -7));
	const lastWeekEnd = parseLocalDateString(addDays(thisWeekStartStr, -1));

	const [thisWeekRows, lastWeekRows, persistedState] = await Promise.all([
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					gte(table.entryDate, thisWeekStart),
					lte(table.entryDate, thisWeekEnd),
				),
			columns: { hadExpense: true, amount: true },
		}),
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					gte(table.entryDate, lastWeekStart),
					lte(table.entryDate, lastWeekEnd),
				),
			columns: { hadExpense: true, amount: true },
		}),
		db.query.dashboardNotificationStates.findFirst({
			where: (table, { and, eq }) =>
				and(
					eq(table.userId, userId),
					eq(table.notificationKey, DIARY_WEEKLY_SUMMARY_NOTIFICATION_KEY),
				),
		}),
	]);

	const summary = computeWeeklySummary({
		daysLoggedThisWeek: thisWeekRows.length,
		totalSpentThisWeek: sumExpenses(thisWeekRows),
		totalSpentLastWeek: sumExpenses(lastWeekRows),
	});

	const fingerprint = getIsoWeekLabel(today);
	const isDismissed =
		persistedState?.fingerprint === fingerprint &&
		persistedState.readAt !== null;

	return {
		...summary,
		notificationKey: DIARY_WEEKLY_SUMMARY_NOTIFICATION_KEY,
		fingerprint,
		isDismissed,
	};
}

export type DiarySettings = {
	reminderEnabled: boolean;
	reminderTime: string;
	dailyBudgetAmount: number | null;
};

export async function fetchDiarySettings(
	userId: string,
): Promise<DiarySettings> {
	const row = await db.query.diaryStreaks.findFirst({
		where: eq(diaryStreaks.userId, userId),
	});

	return {
		reminderEnabled: row?.reminderEnabled ?? true,
		reminderTime: row?.reminderTime ?? DIARY_REMINDER_DEFAULT_TIME,
		dailyBudgetAmount:
			row?.dailyBudgetAmount !== null && row?.dailyBudgetAmount !== undefined
				? safeToNumber(row.dailyBudgetAmount)
				: null,
	};
}

export type EarnedAchievement = {
	badgeKey: string;
	period: string;
	earnedAt: string;
};

export type AchievementsData = {
	earned: EarnedAchievement[];
	catalog: BadgeDefinition[];
};

export async function fetchAchievements(
	userId: string,
): Promise<AchievementsData> {
	const currentPeriod = dateToPeriod(getBusinessTodayDate());

	await evaluatePendingMonthBadges(userId, currentPeriod);

	const rows = await db.query.diaryAchievements.findMany({
		where: eq(diaryAchievements.userId, userId),
		orderBy: (table, { desc }) => [desc(table.earnedAt)],
	});

	return {
		earned: rows.map((row) => ({
			badgeKey: row.badgeKey,
			period: row.period,
			earnedAt: row.earnedAt.toISOString(),
		})),
		catalog: BADGE_DEFINITIONS,
	};
}
