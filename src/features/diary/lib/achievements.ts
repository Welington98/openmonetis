import { and, eq, inArray } from "drizzle-orm";
import { budgets, diaryAchievements } from "@/db/schema";
import {
	DIARY_BADGE_NO_PERIOD,
	DIARY_MONTH_BADGE_LOOKBACK_MONTHS,
	DIARY_MONTH_NO_OVERRUN_BADGE,
	DIARY_STREAK_BADGE_THRESHOLDS,
	type DiaryBadgeKey,
} from "@/features/diary/lib/constants";
import { db } from "@/shared/lib/db";
import { safeToNumber } from "@/shared/utils/number";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	getPreviousPeriod,
	parsePeriod,
} from "@/shared/utils/period";

export type BadgeDefinition = {
	key: DiaryBadgeKey;
	label: string;
};

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
	...DIARY_STREAK_BADGE_THRESHOLDS.map((badge) => ({
		key: badge.key,
		label: badge.label,
	})),
	DIARY_MONTH_NO_OVERRUN_BADGE,
];

/**
 * Concede (idempotente, via unique index) todos os badges de streak cujo
 * limiar foi atingido com a streak atual. Retorna só os que acabaram de ser
 * concedidos por este save (para disparar confete/toast na UI).
 */
export async function evaluateStreakBadges(
	userId: string,
	currentStreak: number,
): Promise<DiaryBadgeKey[]> {
	const qualifying = DIARY_STREAK_BADGE_THRESHOLDS.filter(
		(badge) => currentStreak >= badge.days,
	).map((badge) => badge.key);

	if (qualifying.length === 0) {
		return [];
	}

	const inserted = await db
		.insert(diaryAchievements)
		.values(
			qualifying.map((badgeKey) => ({
				userId,
				badgeKey,
				period: DIARY_BADGE_NO_PERIOD,
			})),
		)
		.onConflictDoNothing()
		.returning({ badgeKey: diaryAchievements.badgeKey });

	return inserted.map((row) => row.badgeKey as DiaryBadgeKey);
}

/**
 * Avalia se um mês (já fechado) terminou sem estourar o orçamento e, se sim,
 * concede o badge para esse período. Sem orçamento cadastrado, não há
 * critério para avaliar (mesma regra do calendário: nunca vermelho sem
 * orçamento). Concede no máximo uma vez por período (unique index).
 */
export async function evaluateMonthNoOverrunBadge(
	userId: string,
	period: string,
): Promise<boolean> {
	const { year, month } = parsePeriod(period);
	const rangeStart = new Date(year, month - 1, 1);
	const rangeEnd = new Date(year, month, 0);

	const [entryRows, budgetRows] = await Promise.all([
		db.query.diaryEntries.findMany({
			where: (table, { and, eq, gte, lte }) =>
				and(
					eq(table.userId, userId),
					eq(table.hadExpense, true),
					gte(table.entryDate, rangeStart),
					lte(table.entryDate, rangeEnd),
				),
			columns: { amount: true },
		}),
		db
			.select({ amount: budgets.amount })
			.from(budgets)
			.where(and(eq(budgets.userId, userId), eq(budgets.period, period))),
	]);

	if (budgetRows.length === 0) {
		return false;
	}

	const totalSpent = entryRows.reduce(
		(sum, row) => sum + (row.amount !== null ? safeToNumber(row.amount) : 0),
		0,
	);
	const totalBudget = budgetRows.reduce(
		(sum, row) => sum + safeToNumber(row.amount),
		0,
	);

	if (totalSpent > totalBudget) {
		return false;
	}

	await db
		.insert(diaryAchievements)
		.values({
			userId,
			badgeKey: DIARY_MONTH_NO_OVERRUN_BADGE.key,
			period,
		})
		.onConflictDoNothing();

	return true;
}

/**
 * Avalia preguiçosamente, num intervalo limitado de meses fechados para
 * trás, quais ainda não têm decisão registrada sobre o badge mensal — e
 * decide agora. Não há cron neste app, então essa reconciliação acontece
 * quando o usuário abre a tela de conquistas.
 */
export async function evaluatePendingMonthBadges(
	userId: string,
	currentPeriod: string,
): Promise<void> {
	const lookbackStart = addMonthsToPeriod(
		currentPeriod,
		-DIARY_MONTH_BADGE_LOOKBACK_MONTHS,
	);
	const previousPeriod = getPreviousPeriod(currentPeriod);
	const candidatePeriods = buildPeriodRange(lookbackStart, previousPeriod);

	if (candidatePeriods.length === 0) {
		return;
	}

	const decided = await db
		.select({ period: diaryAchievements.period })
		.from(diaryAchievements)
		.where(
			and(
				eq(diaryAchievements.userId, userId),
				eq(diaryAchievements.badgeKey, DIARY_MONTH_NO_OVERRUN_BADGE.key),
				inArray(diaryAchievements.period, candidatePeriods),
			),
		);
	const decidedSet = new Set(decided.map((row) => row.period));
	const pendingPeriods = candidatePeriods.filter(
		(period) => !decidedSet.has(period),
	);

	if (pendingPeriods.length === 0) {
		return;
	}

	await Promise.all(
		pendingPeriods.map((period) => evaluateMonthNoOverrunBadge(userId, period)),
	);
}
