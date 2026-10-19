"use server";

import { eq } from "drizzle-orm";
import { dailyBudgetSettings, dailyForecastItems } from "@/db/schema";
import {
	type DailyBudgetSettingsInput,
	type DailyForecastItemsInput,
	dailyBudgetSettingsInputSchema,
	dailyForecastItemsInputSchema,
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

/** Substitui a lista de previsão de diário do usuário (lista pequena, então apaga e regrava). */
export async function saveDailyForecastItemsAction(
	input: DailyForecastItemsInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const items = dailyForecastItemsInputSchema.parse(input);

		await db.transaction(async (tx) => {
			await tx
				.delete(dailyForecastItems)
				.where(eq(dailyForecastItems.userId, user.id));

			if (items.length > 0) {
				// created_at escalonado em 1 ms preserva a ordem digitada, já que
				// defaultNow() devolve o mesmo instante dentro de uma transação.
				const baseTime = Date.now();
				await tx.insert(dailyForecastItems).values(
					items.map((item, index) => ({
						userId: user.id,
						name: item.name,
						amount: item.amount.toFixed(2),
						createdAt: new Date(baseTime + index),
					})),
				);
			}
		});

		revalidateForEntity("dailyBudget", user.id);

		return { success: true, message: "Previsão de diário salva." };
	} catch (error) {
		return handleActionError(error);
	}
}
