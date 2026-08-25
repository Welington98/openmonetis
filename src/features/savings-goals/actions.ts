"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { savingsGoals } from "@/db/schema";
import { fetchAccountCurrentBalance } from "@/features/savings-goals/queries";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { requiredDecimalSchema, uuidSchema } from "@/shared/lib/schemas/common";
import type { ActionResult } from "@/shared/lib/types/actions";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";

const dateOnlySchema = (fieldName: string) =>
	z
		.string({ message: `Informe ${fieldName}.` })
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, `Informe ${fieldName} válida.`);

const savingsGoalFieldsSchema = z.object({
	description: z
		.string({ message: "Informe uma descrição." })
		.trim()
		.min(1, "Informe uma descrição.")
		.max(120, "A descrição deve ter no máximo 120 caracteres."),
	targetAmount: requiredDecimalSchema("valor alvo"),
	startDate: dateOnlySchema("a data de início"),
	targetDate: dateOnlySchema("a data alvo"),
	destinationAccountId: uuidSchema("Conta de destino"),
});

const withDateOrderRefinement = <T extends z.ZodTypeAny>(schema: T) =>
	schema.superRefine((data, ctx) => {
		const value = data as z.infer<typeof savingsGoalFieldsSchema>;
		if (value.targetDate < value.startDate) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "A data alvo deve ser posterior à data de início.",
				path: ["targetDate"],
			});
		}
	});

const createSavingsGoalSchema = withDateOrderRefinement(
	savingsGoalFieldsSchema,
);
const updateSavingsGoalSchema = withDateOrderRefinement(
	savingsGoalFieldsSchema.extend({ id: uuidSchema("Meta") }),
);
const deleteSavingsGoalSchema = z.object({ id: uuidSchema("Meta") });

type SavingsGoalCreateInput = z.input<typeof createSavingsGoalSchema>;
type SavingsGoalUpdateInput = z.input<typeof updateSavingsGoalSchema>;
type SavingsGoalDeleteInput = z.input<typeof deleteSavingsGoalSchema>;

export async function createSavingsGoalAction(
	input: SavingsGoalCreateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = createSavingsGoalSchema.parse(input);

		const currentBalance = await fetchAccountCurrentBalance(
			user.id,
			data.destinationAccountId,
		);

		if (currentBalance === null) {
			return { success: false, error: "Conta de destino inválida." };
		}

		await db.insert(savingsGoals).values({
			description: data.description,
			targetAmount: formatDecimalForDbRequired(data.targetAmount),
			startDate: parseLocalDateString(data.startDate),
			targetDate: parseLocalDateString(data.targetDate),
			destinationAccountId: data.destinationAccountId,
			startingBalance: formatDecimalForDbRequired(currentBalance),
			userId: user.id,
		});

		revalidateForEntity("savingsGoals", user.id);

		return { success: true, message: "Meta criada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function updateSavingsGoalAction(
	input: SavingsGoalUpdateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateSavingsGoalSchema.parse(input);

		const [existing] = await db
			.select({ destinationAccountId: savingsGoals.destinationAccountId })
			.from(savingsGoals)
			.where(
				and(eq(savingsGoals.id, data.id), eq(savingsGoals.userId, user.id)),
			)
			.limit(1);

		if (!existing) {
			return { success: false, error: "Meta não encontrada." };
		}

		const accountChanged =
			existing.destinationAccountId !== data.destinationAccountId;

		const setValues: Partial<typeof savingsGoals.$inferInsert> = {
			description: data.description,
			targetAmount: formatDecimalForDbRequired(data.targetAmount),
			startDate: parseLocalDateString(data.startDate),
			targetDate: parseLocalDateString(data.targetDate),
			destinationAccountId: data.destinationAccountId,
			updatedAt: new Date(),
		};

		if (accountChanged) {
			const currentBalance = await fetchAccountCurrentBalance(
				user.id,
				data.destinationAccountId,
			);

			if (currentBalance === null) {
				return { success: false, error: "Conta de destino inválida." };
			}

			setValues.startingBalance = formatDecimalForDbRequired(currentBalance);
		}

		const [updated] = await db
			.update(savingsGoals)
			.set(setValues)
			.where(
				and(eq(savingsGoals.id, data.id), eq(savingsGoals.userId, user.id)),
			)
			.returning({ id: savingsGoals.id });

		if (!updated) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("savingsGoals", user.id);

		return { success: true, message: "Meta atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteSavingsGoalAction(
	input: SavingsGoalDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteSavingsGoalSchema.parse(input);

		const [deleted] = await db
			.delete(savingsGoals)
			.where(
				and(eq(savingsGoals.id, data.id), eq(savingsGoals.userId, user.id)),
			)
			.returning({ id: savingsGoals.id });

		if (!deleted) {
			return { success: false, error: "Meta não encontrada." };
		}

		revalidateForEntity("savingsGoals", user.id);

		return { success: true, message: "Meta removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
