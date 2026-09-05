import { eq } from "drizzle-orm";
import { type CostCenter, costCenters } from "@/db/schema";
import {
	COST_CENTER_KIND_LABEL,
	type CostCenterKind,
	DEFAULT_COST_CENTERS,
} from "@/shared/lib/cost-centers/constants";
import { db } from "@/shared/lib/db";

/**
 * Retorna os centros de custo do usuário, criando os 3 padrão
 * (Fixa/Variável/Economia) na primeira vez que o usuário é lido — mesmo
 * padrão de `seedDefaultCategoriesForUser`, mas on-demand em vez de só no
 * signup, pra cobrir usuários criados antes dessa feature existir.
 */
export async function fetchOrSeedCostCentersForUser(
	userId: string,
): Promise<CostCenter[]> {
	const existing = await db.query.costCenters.findMany({
		where: eq(costCenters.userId, userId),
	});

	if (existing.length > 0) {
		return existing;
	}

	return db
		.insert(costCenters)
		.values(
			DEFAULT_COST_CENTERS.map((costCenter) => ({
				name: costCenter.name,
				kind: costCenter.kind,
				userId,
			})),
		)
		.returning();
}

/** Formata centros de custo como opções de `<Select>`, rotuladas com o tipo de roteamento. */
export function buildCostCenterOptions(
	costCenterRows: CostCenter[],
): Array<{ value: string; label: string }> {
	return costCenterRows.map((costCenter) => ({
		value: costCenter.id,
		label: `${costCenter.name} (${COST_CENTER_KIND_LABEL[costCenter.kind as CostCenterKind]})`,
	}));
}
