"use server";

import { dailyBudgetSettings } from "@/db/schema";
import {
	type DailyBudgetSettingsInput,
	dailyBudgetSettingsInputSchema,
} from "@/features/daily-budget/lib/schemas";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import { getBusinessDateString } from "@/shared/utils/date";

export async function saveDailyBudgetSettingsAction(
	input: DailyBudgetSettingsInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = dailyBudgetSettingsInputSchema.parse(input);
		const period = getBusinessDateString().slice(0, 7);

		await db
			.insert(dailyBudgetSettings)
			.values({
				userId: user.id,
				period,
				calculationMode: data.calculationMode,
				customDailyLimit:
					data.customDailyLimit !== null ? String(data.customDailyLimit) : null,
				targetSavings:
					data.targetSavings !== null ? String(data.targetSavings) : null,
				safetyBuffer:
					data.safetyBuffer !== null ? String(data.safetyBuffer) : null,
			})
			.onConflictDoUpdate({
				target: [dailyBudgetSettings.userId, dailyBudgetSettings.period],
				set: {
					calculationMode: data.calculationMode,
					customDailyLimit:
						data.customDailyLimit !== null
							? String(data.customDailyLimit)
							: null,
					targetSavings:
						data.targetSavings !== null ? String(data.targetSavings) : null,
					safetyBuffer:
						data.safetyBuffer !== null ? String(data.safetyBuffer) : null,
					updatedAt: new Date(),
				},
			});

		revalidateForEntity("dailyBudget", user.id);

		return {
			success: true,
			message: "Configurações do orçamento diário salvas.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}
