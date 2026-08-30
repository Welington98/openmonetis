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
	computeWeeklySummary,
	getIsoWeekLabel,
} from "@/features/diary/lib/weekly-summary";
import { db } from "@/shared/lib/db";
import {
	getBusinessDateString,
	getBusinessTodayDate,
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
	const rollingWindowStart = new Date(todayDate);
	rollingWindowStart.setDate(
		rollingWindowStart.getDate() - (DIARY_ROLLING_AVERAGE_WINDOW_DAYS - 1),
	);

	const [monthRows, rollingWindowRows, budgetRows] = await Promise.all([
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					gte(table.entryDate, rangeStart),
					lte(table.entryDate, rangeEnd),
				),
		}),
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					eq(table.hadExpense, true),
					gte(table.entryDate, rollingWindowStart),
					lte(table.entryDate, todayDate),
				),
			columns: { amount: true },
		}),
		db
			.select({ amount: budgets.amount })
			.from(budgets)
			.where(and(eq(budgets.userId, userId), eq(budgets.period, period))),
	]);

	const entries = monthRows.map(toDiaryEntryData);

	const rollingAmounts = rollingWindowRows
		.map((row) => (row.amount !== null ? safeToNumber(row.amount) : null))
		.filter((amount): amount is number => amount !== null);
	const rollingAverageDailySpend =
		rollingAmounts.length > 0
			? rollingAmounts.reduce((sum, amount) => sum + amount, 0) /
				rollingAmounts.length
			: null;

	const monthlyBudgetTotal =
		budgetRows.length > 0
			? budgetRows.reduce((sum, row) => sum + safeToNumber(row.amount), 0)
			: null;

	const statuses = computeDayStatuses({
		daysInPeriod: buildDaysInPeriod(period),
		entries: entries.map((entry) => ({
			entryDate: entry.entryDate,
			hadExpense: entry.hadExpense,
			amount: entry.amount,
		})),
		rollingAverageDailySpend,
		monthlyBudgetTotal,
	});

	return { entries, statuses };
}

function getWeekBounds(reference: Date): { start: Date; end: Date } {
	const day = reference.getDay(); // 0 (domingo) - 6 (sábado)
	const diffToMonday = day === 0 ? 6 : day - 1;
	const start = new Date(reference);
	start.setDate(start.getDate() - diffToMonday);
	const end = new Date(start);
	end.setDate(start.getDate() + 6);
	return { start, end };
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
	const todayDate = getBusinessTodayDate();
	const { start: thisWeekStart, end: thisWeekEnd } = getWeekBounds(todayDate);
	const lastWeekEnd = new Date(thisWeekStart);
	lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
	const lastWeekStart = new Date(lastWeekEnd);
	lastWeekStart.setDate(lastWeekStart.getDate() - 6);

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

	const fingerprint = getIsoWeekLabel(getBusinessDateString(todayDate));
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
