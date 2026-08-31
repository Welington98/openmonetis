"use server";

import { and, eq, ilike } from "drizzle-orm";
import { categories, diaryEntries, diaryStreaks } from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import {
	evaluateMonthNoOverrunBadge,
	evaluateStreakBadges,
} from "@/features/diary/lib/achievements";
import { mapDiaryCategoryToLabel } from "@/features/diary/lib/category-mapping";
import type { DiaryBadgeKey } from "@/features/diary/lib/constants";
import {
	type DiaryEntryInput,
	diaryEntryInputSchema,
} from "@/features/diary/lib/schemas";
import { computeStreakOnSave } from "@/features/diary/lib/streak";
import {
	createTransactionAction,
	deleteTransactionAction,
	updateTransactionAction,
} from "@/features/transactions/actions/single-actions";
import { isAccountInactive } from "@/shared/lib/accounts/constants";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
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

/** Primeira conta elegível do usuário (mesmo critério de fetchDashboardAccounts.totalBalance). */
async function resolveDefaultAccountId(userId: string): Promise<string | null> {
	const { accounts } = await fetchDashboardAccounts(userId);
	const eligible = accounts.find(
		(account) =>
			!account.excludeFromBalance && !isAccountInactive(account.status),
	);
	return eligible?.id ?? null;
}

/**
 * Tenta mapear a categoria fixa do diário pro nome de uma categoria real do
 * usuário; sem match (ou categoria "outro"), cai numa categoria de despesa
 * genérica qualquer (toda conta tem ao menos uma, seedada no signup).
 */
async function resolveDespesaCategoryId(
	userId: string,
	diaryCategory: string | null,
): Promise<string | null> {
	const label = mapDiaryCategoryToLabel(diaryCategory);

	if (label) {
		const matched = await db.query.categories.findFirst({
			where: and(
				eq(categories.userId, userId),
				eq(categories.type, "despesa"),
				ilike(categories.name, label),
			),
			columns: { id: true },
		});
		if (matched) return matched.id;
	}

	const fallback = await db.query.categories.findFirst({
		where: and(eq(categories.userId, userId), eq(categories.type, "despesa")),
		columns: { id: true },
	});
	return fallback?.id ?? null;
}

/**
 * Cria/atualiza/apaga o lançamento real vinculado ao check-in de hoje, e
 * devolve o `transactionId` a gravar em `diaryEntries` (null = sem gasto, ou
 * sem conta/categoria elegível pra lançar — nesse caso o check-in continua
 * valendo, só não gera lançamento).
 */
async function syncDiaryTransaction({
	userId,
	today,
	existingTransactionId,
	hadExpense,
	amount,
	category,
	note,
}: {
	userId: string;
	today: string;
	existingTransactionId: string | null;
	hadExpense: boolean;
	amount: number | undefined;
	category: string | null;
	note: string | null;
}): Promise<string | null> {
	if (!hadExpense || amount === undefined) {
		if (existingTransactionId) {
			await deleteTransactionAction({ id: existingTransactionId });
		}
		return null;
	}

	const [adminPayerId, accountId, categoryId] = await Promise.all([
		getAdminPayerId(userId),
		resolveDefaultAccountId(userId),
		resolveDespesaCategoryId(userId, category),
	]);

	if (!accountId || !categoryId) {
		if (existingTransactionId) {
			await deleteTransactionAction({ id: existingTransactionId });
		}
		return null;
	}

	const payload = {
		purchaseDate: today,
		name: "Gasto do dia",
		transactionType: "Despesa" as const,
		condition: "À vista" as const,
		paymentMethod: "Dinheiro" as const,
		amount,
		payerId: adminPayerId ?? undefined,
		accountId,
		categoryId,
		note: note ?? null,
		isSettled: true,
		isSplit: false,
	};

	if (existingTransactionId) {
		const result = await updateTransactionAction({
			id: existingTransactionId,
			...payload,
		});
		if (!result.success) {
			console.error(
				"[Diary] Falha ao atualizar lançamento do check-in:",
				result.error,
			);
			return existingTransactionId;
		}
		return existingTransactionId;
	}

	const result = await createTransactionAction(payload);
	if (!result.success) {
		console.error(
			"[Diary] Falha ao criar lançamento do check-in:",
			result.error,
		);
		return null;
	}
	return result.data?.ids[0] ?? null;
}

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

		const transactionId = await syncDiaryTransaction({
			userId: user.id,
			today,
			existingTransactionId: existingEntry?.transactionId ?? null,
			hadExpense: data.hadExpense,
			amount: data.amount,
			category: data.hadExpense ? (data.category ?? null) : null,
			note: data.note ?? null,
		});

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
				transactionId,
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
					transactionId,
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
		revalidateForEntity("transactions", user.id);

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
