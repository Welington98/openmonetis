import { and, eq } from "drizzle-orm";
import { cards, financialAccounts } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { normalizeFilePath } from "@/shared/utils/string";

export type CreateCardForUserInput = {
	name: string;
	brand: string;
	status: string;
	/** Dia do mês (1 a 31), como texto. */
	closingDay: string;
	/** Dia do mês (1 a 31), como texto. */
	dueDay: string;
	note?: string | null;
	limit: number;
	logo: string;
	/** Conta que paga a fatura. */
	accountId: string;
};

export async function assertAccountOwnership(
	userId: string,
	accountId: string,
): Promise<void> {
	const account = await db.query.financialAccounts.findFirst({
		columns: { id: true },
		where: and(
			eq(financialAccounts.id, accountId),
			eq(financialAccounts.userId, userId),
		),
	});

	if (!account) {
		throw new Error("Conta vinculada não encontrada.");
	}
}

/**
 * Cria um cartão de crédito para um usuário já autenticado. Usado pela Server
 * Action `createCardAction` e pela tool MCP `create_card`.
 */
export async function createCardForUser(
	userId: string,
	data: CreateCardForUserInput,
): Promise<{ id: string }> {
	await assertAccountOwnership(userId, data.accountId);

	const [created] = await db
		.insert(cards)
		.values({
			name: data.name,
			brand: data.brand,
			status: data.status,
			closingDay: data.closingDay,
			dueDay: data.dueDay,
			note: data.note ?? null,
			limit: formatDecimalForDbRequired(data.limit),
			logo: normalizeFilePath(data.logo),
			accountId: data.accountId,
			userId,
		})
		.returning({ id: cards.id });

	if (!created) {
		throw new Error("Não foi possível criar o cartão.");
	}

	return created;
}
