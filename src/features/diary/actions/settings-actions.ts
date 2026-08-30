"use server";

import { diaryStreaks } from "@/db/schema";
import {
	type DiarySettingsInput,
	diarySettingsInputSchema,
} from "@/features/diary/lib/schemas";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";

export async function updateDiarySettingsAction(
	input: DiarySettingsInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = diarySettingsInputSchema.parse(input);
		const dailyBudgetAmount =
			data.dailyBudgetAmount !== null ? String(data.dailyBudgetAmount) : null;

		await db
			.insert(diaryStreaks)
			.values({
				userId: user.id,
				reminderEnabled: data.reminderEnabled,
				reminderTime: data.reminderTime,
				dailyBudgetAmount,
			})
			.onConflictDoUpdate({
				target: diaryStreaks.userId,
				set: {
					reminderEnabled: data.reminderEnabled,
					reminderTime: data.reminderTime,
					dailyBudgetAmount,
					updatedAt: new Date(),
				},
			});

		revalidateForEntity("diary", user.id);

		return { success: true, message: "Configurações do diário atualizadas." };
	} catch (error) {
		return handleActionError(error);
	}
}
