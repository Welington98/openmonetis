"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { costCenters } from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";

const updateCostCenterSchema = z.object({
	id: uuidSchema("Cost center"),
	name: z
		.string({ message: "Informe o nome do centro de custo." })
		.trim()
		.min(1, "Informe o nome do centro de custo.")
		.max(60, "O nome deve ter no máximo 60 caracteres."),
});

type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>;

/**
 * Renomeia um centro de custo do usuário. O `kind` (fixa/variavel/economia)
 * é imutável — é o que o motor de orçamento diário usa pra decidir o
 * comportamento, só o nome de exibição pode mudar.
 */
export async function updateCostCenterAction(
	input: UpdateCostCenterInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateCostCenterSchema.parse(input);

		const [updated] = await db
			.update(costCenters)
			.set({ name: data.name })
			.where(and(eq(costCenters.id, data.id), eq(costCenters.userId, user.id)))
			.returning({ id: costCenters.id });

		if (!updated) {
			return { success: false, error: "Centro de custo não encontrado." };
		}

		revalidateForEntity("categories", user.id);

		return {
			success: true,
			message: "Centro de custo atualizado com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}
