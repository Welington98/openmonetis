import type { McpServer } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	budgets,
	categories,
	inboxItems,
	savingsGoals,
	transactionAttachments,
	transactions,
} from "@/db/schema";
import {
	dateSchema,
	jsonResult,
	periodSchema,
	requireWriteScope,
} from "@/features/mcp/lib/helpers";
import { fetchAccountCurrentBalance } from "@/features/savings-goals/queries";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { CATEGORY_TYPES } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { parseLocalDateString } from "@/shared/utils/date";
import { normalizeIconInput } from "@/shared/utils/string";

/**
 * Tools MCP de escrita de baixo risco (criação de categorias, orçamentos e
 * metas, e triagem do inbox). Todas exigem o escopo `finance:write` e filtram
 * por userId do token. Nenhuma tool aqui paga fatura, move dinheiro entre
 * contas ou exclui contas/cartões — esses fluxos ficam só no app.
 */
export function registerWriteTools(server: McpServer) {
	server.registerTool(
		"create_category",
		{
			title: "Criar categoria",
			description:
				"Cria uma nova categoria de receita ou despesa para o usuário autenticado.",
			inputSchema: z.object({
				name: z.string().trim().min(1).max(100).describe("Nome da categoria"),
				type: z.enum(CATEGORY_TYPES).describe("Tipo: receita ou despesa"),
				icon: z
					.string()
					.trim()
					.max(100)
					.optional()
					.describe("Ícone (opcional, mesmo formato usado no app)"),
			}),
		},
		async ({ name, type, icon }, ctx) => {
			const userId = requireWriteScope(ctx);

			const [created] = await db
				.insert(categories)
				.values({ name, type, icon: normalizeIconInput(icon), userId })
				.returning({ id: categories.id });

			if (!created) throw new Error("Não foi possível criar a categoria.");

			revalidateForEntity("categories", userId);

			return jsonResult({
				message: "Categoria criada com sucesso.",
				category: { id: created.id, name, type },
			});
		},
	);

	server.registerTool(
		"create_budget",
		{
			title: "Criar orçamento",
			description:
				"Cria o orçamento (limite de gasto) de uma categoria de despesa em um período. Só pode existir um orçamento por categoria/período. Descubra o categoryId com list_categories.",
			inputSchema: z.object({
				categoryId: z
					.string()
					.uuid()
					.describe("ID da categoria de despesa (ver list_categories)"),
				period: periodSchema.describe("Período YYYY-MM"),
				amount: z.number().min(0).describe("Valor limite do orçamento"),
			}),
		},
		async ({ categoryId, period, amount }, ctx) => {
			const userId = requireWriteScope(ctx);

			const category = await db.query.categories.findFirst({
				columns: { id: true, name: true, type: true },
				where: and(
					eq(categories.id, categoryId),
					eq(categories.userId, userId),
				),
			});
			if (!category) throw new Error("Categoria não encontrada.");
			if (category.type !== "despesa") {
				throw new Error("Selecione uma categoria de despesa.");
			}

			const [created] = await db
				.insert(budgets)
				.values({
					amount: formatDecimalForDbRequired(amount),
					period,
					userId,
					categoryId,
				})
				.onConflictDoNothing({
					target: [budgets.userId, budgets.categoryId, budgets.period],
				})
				.returning({ id: budgets.id });

			if (!created) {
				throw new Error(
					"Já existe um orçamento para esta categoria no período selecionado.",
				);
			}

			revalidateForEntity("budgets", userId);

			return jsonResult({
				message: "Orçamento criado com sucesso.",
				budget: {
					id: created.id,
					category: category.name,
					period,
					amount,
				},
			});
		},
	);

	server.registerTool(
		"create_savings_goal",
		{
			title: "Criar meta de economia",
			description:
				"Cria uma meta de economia com valor alvo, datas e conta de destino (o saldo atual da conta vira o ponto de partida). Descubra o accountId com list_accounts.",
			inputSchema: z.object({
				description: z.string().trim().min(1).max(120).describe("Descrição"),
				targetAmount: z.number().positive().describe("Valor alvo"),
				startDate: dateSchema.describe("Data de início, YYYY-MM-DD"),
				targetDate: dateSchema.describe("Data alvo, YYYY-MM-DD"),
				destinationAccountId: z
					.string()
					.uuid()
					.describe("ID da conta de destino (ver list_accounts)"),
			}),
		},
		async (
			{
				description,
				targetAmount,
				startDate,
				targetDate,
				destinationAccountId,
			},
			ctx,
		) => {
			const userId = requireWriteScope(ctx);

			if (targetDate < startDate) {
				throw new Error("A data alvo deve ser posterior à data de início.");
			}

			const currentBalance = await fetchAccountCurrentBalance(
				userId,
				destinationAccountId,
			);
			if (currentBalance === null)
				throw new Error("Conta de destino inválida.");

			const [created] = await db
				.insert(savingsGoals)
				.values({
					description,
					targetAmount: formatDecimalForDbRequired(targetAmount),
					startDate: parseLocalDateString(startDate),
					targetDate: parseLocalDateString(targetDate),
					destinationAccountId,
					startingBalance: formatDecimalForDbRequired(currentBalance),
					userId,
				})
				.returning({ id: savingsGoals.id });

			if (!created) throw new Error("Não foi possível criar a meta.");

			revalidateForEntity("savingsGoals", userId);

			return jsonResult({
				message: "Meta criada com sucesso.",
				goal: {
					id: created.id,
					description,
					targetAmount,
					startDate,
					targetDate,
					destinationAccountId,
				},
			});
		},
	);

	server.registerTool(
		"process_inbox_item",
		{
			title: "Marcar item do inbox como processado",
			description:
				"Marca um item pendente do inbox como processado, vinculando-o ao lançamento já criado a partir dele (ver create_transaction). Se o item veio de um comprovante em PDF, o arquivo é anexado ao lançamento.",
			inputSchema: z.object({
				inboxItemId: z.string().uuid().describe("ID do item (ver list_inbox)"),
				transactionId: z
					.string()
					.uuid()
					.describe("ID do lançamento criado a partir do item"),
			}),
		},
		async ({ inboxItemId, transactionId }, ctx) => {
			const userId = requireWriteScope(ctx);

			const [item] = await db
				.select()
				.from(inboxItems)
				.where(
					and(
						eq(inboxItems.id, inboxItemId),
						eq(inboxItems.userId, userId),
						eq(inboxItems.status, "pending"),
					),
				)
				.limit(1);
			if (!item) throw new Error("Item não encontrado ou já processado.");

			const transaction = await db.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.id, transactionId),
					eq(transactions.userId, userId),
				),
			});
			if (!transaction) throw new Error("Lançamento não encontrado.");

			await db
				.update(inboxItems)
				.set({
					status: "processed",
					processedAt: new Date(),
					transactionId,
					updatedAt: new Date(),
				})
				.where(
					and(eq(inboxItems.id, inboxItemId), eq(inboxItems.userId, userId)),
				);

			if (item.attachmentId) {
				await db
					.insert(transactionAttachments)
					.values({ transactionId, attachmentId: item.attachmentId })
					.onConflictDoNothing();
			}

			revalidateForEntity("inbox", userId);

			return jsonResult({
				message: "Item processado com sucesso.",
				inboxItemId,
				transactionId,
			});
		},
	);

	server.registerTool(
		"discard_inbox_item",
		{
			title: "Descartar item do inbox",
			description:
				"Descarta um item pendente do inbox (ex.: notificação irrelevante). O item não é excluído — pode ser restaurado no app.",
			inputSchema: z.object({
				inboxItemId: z.string().uuid().describe("ID do item (ver list_inbox)"),
			}),
		},
		async ({ inboxItemId }, ctx) => {
			const userId = requireWriteScope(ctx);

			const [item] = await db
				.select({ id: inboxItems.id })
				.from(inboxItems)
				.where(
					and(
						eq(inboxItems.id, inboxItemId),
						eq(inboxItems.userId, userId),
						eq(inboxItems.status, "pending"),
					),
				)
				.limit(1);
			if (!item) throw new Error("Item não encontrado ou já processado.");

			await db
				.update(inboxItems)
				.set({
					status: "discarded",
					discardedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(eq(inboxItems.id, inboxItemId), eq(inboxItems.userId, userId)),
				);

			revalidateForEntity("inbox", userId);

			return jsonResult({ message: "Item descartado.", inboxItemId });
		},
	);
}
