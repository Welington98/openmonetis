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
	createAccountForUser,
	transferBetweenAccountsForUser,
} from "@/features/accounts/lib/account-services";
import { createCardForUser } from "@/features/cards/lib/card-services";
import {
	dateSchema,
	jsonResult,
	periodSchema,
	requireWriteScope,
} from "@/features/mcp/lib/helpers";
import { fetchAccountCurrentBalance } from "@/features/savings-goals/queries";
import {
	ACCOUNT_STATUSES,
	ACCOUNT_TYPES,
} from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { CATEGORY_TYPES } from "@/shared/lib/categories/constants";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import {
	getBusinessDateString,
	parseLocalDateString,
} from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";
import { normalizeIconInput } from "@/shared/utils/string";

/** Nome de arquivo de logo (ex.: "itau.png"), sem caminho. */
const logoFileSchema = z
	.string()
	.trim()
	.regex(
		/^[\w.-]+\.(png|svg|webp|jpg)$/i,
		"Use só o nome do arquivo, ex.: itau.png",
	);

const DEFAULT_ACCOUNT_LOGO = "dinheiro.png";
const DEFAULT_CARD_LOGO_BY_BRAND: Record<string, string> = {
	visa: "visa.png",
	mastercard: "mastercard.png",
};

/**
 * Tools MCP de escrita (criação de categorias, orçamentos, metas, contas,
 * cartões e transferências entre contas, e triagem do inbox). Todas exigem o
 * escopo `finance:write` e filtram por userId do token. Nenhuma tool aqui paga
 * fatura de cartão nem exclui contas/cartões — esses fluxos ficam só no app.
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

	server.registerTool(
		"create_account",
		{
			title: "Criar conta",
			description:
				"Cria uma conta financeira (corrente, carteira, VR/VA, dinheiro...). Saldo inicial positivo é credor e negativo é devedor (vira um lançamento de saldo inicial). Use excludeFromBalance=true para uma conta que não deve entrar nos totais nem no orçamento diário (por exemplo, uma conta só para acompanhar contas de terceiros).",
			inputSchema: z.object({
				name: z.string().trim().min(1).max(100).describe("Nome da conta"),
				accountType: z
					.enum(ACCOUNT_TYPES)
					.describe("Tipo da conta, como no cadastro do app"),
				initialBalance: z
					.number()
					.optional()
					.describe("Saldo inicial (padrão 0); negativo = devedor"),
				initialBalanceDate: dateSchema
					.optional()
					.describe("Data do saldo inicial, YYYY-MM-DD (padrão: hoje)"),
				excludeFromBalance: z
					.boolean()
					.optional()
					.describe("Excluir a conta dos saldos e do orçamento diário"),
				excludeInitialBalanceFromIncome: z
					.boolean()
					.optional()
					.describe("Não contar o saldo inicial como receita nos relatórios"),
				status: z.enum(ACCOUNT_STATUSES).optional().describe("Padrão: Ativa"),
				logo: logoFileSchema
					.optional()
					.describe("Arquivo de logo (ex.: itau.png). Padrão: dinheiro.png"),
				note: z.string().trim().max(500).optional().describe("Anotação"),
			}),
		},
		async (input, ctx) => {
			const userId = requireWriteScope(ctx);

			const created = await createAccountForUser(userId, {
				name: input.name,
				accountType: input.accountType,
				status: input.status ?? "Ativa",
				note: input.note ?? null,
				logo: input.logo ?? DEFAULT_ACCOUNT_LOGO,
				initialBalance: input.initialBalance ?? 0,
				excludeFromBalance: input.excludeFromBalance ?? false,
				excludeInitialBalanceFromIncome:
					input.excludeInitialBalanceFromIncome ?? false,
				initialBalanceDate: input.initialBalanceDate,
			});

			revalidateForEntity("accounts", userId);

			return jsonResult({
				message: "Conta criada com sucesso.",
				account: {
					id: created.id,
					name: input.name,
					accountType: input.accountType,
				},
			});
		},
	);

	server.registerTool(
		"create_card",
		{
			title: "Criar cartão de crédito",
			description:
				"Cadastra um cartão de crédito com limite, dia de fechamento, dia de vencimento e a conta que paga a fatura (ver list_accounts). O dia de fechamento define em qual fatura cai cada compra.",
			inputSchema: z.object({
				name: z.string().trim().min(1).max(100).describe("Nome do cartão"),
				brand: z
					.string()
					.trim()
					.min(1)
					.max(50)
					.describe("Bandeira, ex.: Visa, Mastercard, Elo"),
				limit: z.number().min(0).describe("Limite do cartão"),
				closingDay: z
					.number()
					.int()
					.min(1)
					.max(31)
					.describe("Dia do mês em que a fatura fecha"),
				dueDay: z
					.number()
					.int()
					.min(1)
					.max(31)
					.describe("Dia do mês em que a fatura vence"),
				accountId: z
					.string()
					.uuid()
					.describe("Conta que paga a fatura (ver list_accounts)"),
				logo: logoFileSchema
					.optional()
					.describe("Arquivo de logo (ex.: havan.png). Padrão: pela bandeira"),
				status: z
					.enum(["Ativo", "Inativo"])
					.optional()
					.describe("Padrão: Ativo"),
				note: z.string().trim().max(500).optional().describe("Anotação"),
			}),
		},
		async (input, ctx) => {
			const userId = requireWriteScope(ctx);

			const created = await createCardForUser(userId, {
				name: input.name,
				brand: input.brand,
				status: input.status ?? "Ativo",
				closingDay: String(input.closingDay),
				dueDay: String(input.dueDay),
				note: input.note ?? null,
				limit: input.limit,
				logo:
					input.logo ??
					DEFAULT_CARD_LOGO_BY_BRAND[input.brand.toLowerCase()] ??
					"visa.png",
				accountId: input.accountId,
			});

			revalidateForEntity("cards", userId);

			return jsonResult({
				message: "Cartão criado com sucesso.",
				card: {
					id: created.id,
					name: input.name,
					limit: input.limit,
					closingDay: input.closingDay,
					dueDay: input.dueDay,
				},
			});
		},
	);

	server.registerTool(
		"create_transfer",
		{
			title: "Transferir entre contas",
			description:
				"Registra uma transferência entre duas contas do próprio usuário (cria o par de lançamentos de saída e entrada, que não conta como receita nem despesa). Não é uma transferência bancária real: só registra no sistema. Descubra os IDs com list_accounts.",
			inputSchema: z.object({
				fromAccountId: z
					.string()
					.uuid()
					.describe("Conta de origem (ver list_accounts)"),
				toAccountId: z
					.string()
					.uuid()
					.describe("Conta de destino (ver list_accounts)"),
				amount: z.number().positive().describe("Valor transferido"),
				date: dateSchema
					.optional()
					.describe("Data da transferência, YYYY-MM-DD (padrão: hoje)"),
			}),
		},
		async ({ fromAccountId, toAccountId, amount, date }, ctx) => {
			const userId = requireWriteScope(ctx);

			const dateString = date ?? getBusinessDateString();

			await transferBetweenAccountsForUser(userId, {
				fromAccountId,
				toAccountId,
				amount,
				date: parseLocalDateString(dateString),
				period: derivePeriodFromDate(dateString),
				condition: "À vista",
				installmentCount: 1,
			});

			revalidateForEntity("accounts", userId);
			revalidateForEntity("transactions", userId);

			return jsonResult({
				message: "Transferência registrada com sucesso.",
				transfer: { fromAccountId, toAccountId, amount, date: dateString },
			});
		},
	);
}
