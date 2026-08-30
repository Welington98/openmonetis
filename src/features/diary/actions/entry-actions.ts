"use server";

import { and, eq } from "drizzle-orm";
import { diaryEntries, diaryStreaks } from "@/db/schema";
import {
	evaluateMonthNoOverrunBadge,
	evaluateStreakBadges,
} from "@/features/diary/lib/achievements";
import type { DiaryBadgeKey } from "@/features/diary/lib/constants";
import {
	type DiaryEntryInput,
	diaryEntryInputSchema,
} from "@/features/diary/lib/schemas";
import { computeStreakOnSave } from "@/features/diary/lib/streak";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import {
	getBusinessDateString,
	getBusinessTodayDate,
	toDateOnlyString,
} from "@/shared/utils/date";
import { dateToPeriod } from "@/shared/utils/period";

export type SaveTodayEntryResult = {
	currentStreak: number;
	longestStreak: number;
	newlyEarnedBadges: DiaryBadgeKey[];
};

export async function saveTodayEntryAction(
	input: DiaryEntryInput,
): Promise<ActionResult<SaveTodayEntryResult>> {
	try {
		const user = await getUser();
		const data = diaryEntryInputSchema.parse(input);
		const now = new Date();
		const today = getBusinessDateString(now);
		const todayDate = getBusinessTodayDate(now);

		// Nunca aceitamos uma data vinda do cliente: o check-in criado/editado
		// aqui é sempre o de hoje, o que bloqueia estruturalmente a edição de
		// dias passados.
		const existingEntry = await db.query.diaryEntries.findFirst({
			where: and(
				eq(diaryEntries.userId, user.id),
				eq(diaryEntries.entryDate, todayDate),
			),
		});
		const isEditOfToday = existingEntry !== undefined;

		await db
			.insert(diaryEntries)
			.values({
				userId: user.id,
				entryDate: todayDate,
				hadExpense: data.hadExpense,
				amount:
					data.hadExpense && data.amount !== undefined
						? String(data.amount)
						: null,
				category: data.hadExpense ? (data.category ?? null) : null,
				classification: data.hadExpense ? (data.classification ?? null) : null,
				note: data.note ?? null,
			})
			.onConflictDoUpdate({
				target: [diaryEntries.userId, diaryEntries.entryDate],
				set: {
					hadExpense: data.hadExpense,
					amount:
						data.hadExpense && data.amount !== undefined
							? String(data.amount)
							: null,
					category: data.hadExpense ? (data.category ?? null) : null,
					classification: data.hadExpense
						? (data.classification ?? null)
						: null,
					note: data.note ?? null,
					updatedAt: new Date(),
				},
			});

		const streakRow = await db.query.diaryStreaks.findFirst({
			where: eq(diaryStreaks.userId, user.id),
		});

		const nextStreak = computeStreakOnSave({
			today,
			isEditOfToday,
			previousLastEntryDate: toDateOnlyString(streakRow?.lastEntryDate ?? null),
			previousCurrentStreak: streakRow?.currentStreak ?? 0,
			previousLongestStreak: streakRow?.longestStreak ?? 0,
		});

		await db
			.insert(diaryStreaks)
			.values({
				userId: user.id,
				currentStreak: nextStreak.currentStreak,
				longestStreak: nextStreak.longestStreak,
				lastEntryDate: todayDate,
			})
			.onConflictDoUpdate({
				target: diaryStreaks.userId,
				set: {
					currentStreak: nextStreak.currentStreak,
					longestStreak: nextStreak.longestStreak,
					lastEntryDate: todayDate,
					updatedAt: new Date(),
				},
			});

		const newlyEarnedBadges = await evaluateStreakBadges(
			user.id,
			nextStreak.currentStreak,
		);

		// Se o check-in fechou o mês anterior (mudou de mês desde o último
		// registro), avalia agora o badge "mês sem estourar o orçamento" para
		// esse mês que acabou de fechar.
		const previousLastEntryDate = toDateOnlyString(
			streakRow?.lastEntryDate ?? null,
		);
		if (!isEditOfToday && previousLastEntryDate) {
			const previousPeriod = previousLastEntryDate.slice(0, 7);
			const currentPeriod = dateToPeriod(todayDate);
			if (previousPeriod !== currentPeriod) {
				await evaluateMonthNoOverrunBadge(user.id, previousPeriod);
			}
		}

		revalidateForEntity("diary", user.id);

		return {
			success: true,
			message: isEditOfToday
				? "Check-in de hoje atualizado."
				: "Check-in de hoje registrado!",
			data: {
				currentStreak: nextStreak.currentStreak,
				longestStreak: nextStreak.longestStreak,
				newlyEarnedBadges,
			},
		};
	} catch (error) {
		const result = handleActionError(error);
		return {
			success: false,
			error: result.success ? "Ocorreu um erro inesperado." : result.error,
		};
	}
}
