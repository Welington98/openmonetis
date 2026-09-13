import type { BaseContext, McpServer } from "@modelcontextprotocol/server";
import { and, eq, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod";
import {
	categories,
	costCenters,
	financialAccounts,
	transactions,
} from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import { fetchCategoryReport } from "@/features/reports/lib/category-report-queries";
import { validateDateRange } from "@/features/reports/lib/utils";
import { resolvePeriod } from "@/features/transactions/actions/core";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import {
	fetchTransactionsPageWithRelations,
	fetchTransactionsWithRelations,
} from "@/features/transactions/queries";
import { fetchOrSeedCostCentersForUser } from "@/shared/lib/cost-centers/queries";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import {
	getBusinessDateString,
	parseLocalDateString,
} from "@/shared/utils/date";

const periodSchema = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato esperado: YYYY-MM");

const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD");

type TransactionRow = Awaited<
	ReturnType<typeof fetchTransactionsWithRelations>
>[number];

function requireUserId(ctx: BaseContext): string {
	const userId = ctx.http?.authInfo?.extra?.userId;
	if (typeof userId !== "string" || !userId) {
		throw new Error("Não autenticado.");
	}
	return userId;
}

function requireWriteScope(ctx: BaseContext): string {
	const userId = requireUserId(ctx);
	const scopes = ctx.http?.authInfo?.scopes ?? [];
	if (!scopes.includes("finance:write")) {
		throw new Error("Token sem permissão de escrita (finance:write).");
	}
	return userId;
}

const TRANSACTION_TYPE_LABEL = {
	despesa: "Despesa",
	receita: "Receita",
} as const;

const WRITABLE_PAYMENT_METHODS = PAYMENT_METHODS.filter(
	(method) => method !== "Cartão de crédito",
) as [(typeof PAYMENT_METHODS)[number], ...(typeof PAYMENT_METHODS)[number][]];

function jsonResult(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	};
}

function serializeTransaction(row: TransactionRow) {
	return {
		id: row.id,
		name: row.name,
		note: row.note,
		amount: Number(row.amount),
		type: row.transactionType,
		condition: row.condition,
		isSettled: row.isSettled,
		purchaseDate: row.purchaseDate.toISOString().slice(0, 10),
		dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
		installment:
			row.installmentCount && row.currentInstallment
				? `${row.currentInstallment}/${row.installmentCount}`
				: null,
		category: row.category
			? {
					id: row.category.id,
					name: row.category.name,
					type: row.category.type,
				}
			: null,
		account: row.financialAccount
			? { id: row.financialAccount.id, name: row.financialAccount.name }
			: null,
		card: row.card ? { id: row.card.id, name: row.card.name } : null,
		payer: row.payer ? { id: row.payer.id, name: row.payer.name } : null,
	};
}

/**
 * Registra as tools MCP de consulta e escrita financeira. userId nunca vem
 * dos argumentos da tool — só do token Bearer verificado (ctx.http.authInfo),
 * então uma tool jamais pode ler ou escrever dados de outro usuário. Tools de
 * escrita (`create_transaction`) também exigem o escopo `finance:write` do
 * token, verificado em `requireWriteScope`.
 */
export function registerFinanceTools(server: McpServer) {
	server.registerTool(
		"list_transactions",
		{
			title: "Listar lançamentos financeiros",
			description:
				"Lista lançamentos (transações) financeiros do usuário autenticado, com filtros de data, tipo, categoria e busca por nome. Use para responder perguntas sobre gastos, receitas e histórico financeiro.",
			inputSchema: z.object({
				startDate: dateSchema
					.optional()
					.describe("Data de compra inicial (inclusive), formato YYYY-MM-DD"),
				endDate: dateSchema
					.optional()
					.describe("Data de compra final (inclusive), formato YYYY-MM-DD"),
				type: z
					.enum(["receita", "despesa"])
					.optional()
					.describe("Filtra por tipo de lançamento"),
				categoryId: z
					.string()
					.uuid()
					.optional()
					.describe("Filtra por ID de categoria"),
				search: z
					.string()
					.min(1)
					.optional()
					.describe("Busca por texto no nome do lançamento"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.default(20)
					.describe("Máximo de lançamentos a retornar (padrão 20, máximo 100)"),
			}),
		},
		async ({ startDate, endDate, type, categoryId, search, limit }, ctx) => {
			const userId = requireUserId(ctx);

			const filters = [eq(transactions.userId, userId)];
			if (startDate) {
				filters.push(gte(transactions.purchaseDate, new Date(startDate)));
			}
			if (endDate) {
				filters.push(lte(transactions.purchaseDate, new Date(endDate)));
			}
			if (type) {
				filters.push(
					eq(transactions.transactionType, TRANSACTION_TYPE_LABEL[type]),
				);
			}
			if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
			if (search) filters.push(ilike(transactions.name, `%${search}%`));

			const { rows, totalItems } = await fetchTransactionsPageWithRelations({
				filters,
				page: 1,
				pageSize: limit,
			});

			return jsonResult({
				totalMatching: totalItems,
				returned: rows.length,
				transactions: rows.map(serializeTransaction),
			});
		},
	);

	server.registerTool(
		"get_transaction",
		{
			title: "Detalhar um lançamento",
			description:
				"Busca um lançamento financeiro específico do usuário pelo ID retornado por list_transactions.",
			inputSchema: z.object({ id: z.string().uuid() }),
		},
		async ({ id }, ctx) => {
			const userId = requireUserId(ctx);
			const [row] = await fetchTransactionsWithRelations({
				filters: [eq(transactions.userId, userId), eq(transactions.id, id)],
			});
			if (!row) throw new Error("Lançamento não encontrado.");
			return jsonResult(serializeTransaction(row));
		},
	);

	server.registerTool(
		"list_categories",
		{
			title: "Listar categorias",
			description:
				"Lista as categorias de receita/despesa cadastradas pelo usuário.",
			inputSchema: z.object({
				type: z.enum(["receita", "despesa"]).optional(),
			}),
		},
		async ({ type }, ctx) => {
			const userId = requireUserId(ctx);
			const rows = await db.query.categories.findMany({
				where: type
					? and(eq(categories.userId, userId), eq(categories.type, type))
					: eq(categories.userId, userId),
			});
			return jsonResult(
				rows.map((c) => ({
					id: c.id,
					name: c.name,
					type: c.type,
					icon: c.icon,
				})),
			);
		},
	);

	server.registerTool(
		"list_accounts",
		{
			title: "Listar contas e saldos",
			description:
				"Lista as contas financeiras do usuário (contas correntes, carteiras, investimentos etc.) com o saldo atual calculado de cada uma e o saldo total consolidado.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const { totalBalance, accounts } = await fetchDashboardAccounts(userId);
			return jsonResult({
				totalBalance,
				accounts: accounts.map((a) => ({
					id: a.id,
					name: a.name,
					accountType: a.accountType,
					status: a.status,
					balance: a.balance,
				})),
			});
		},
	);

	server.registerTool(
		"category_summary",
		{
			title: "Resumo de gastos por categoria",
			description:
				"Soma receitas/despesas por categoria em um intervalo de períodos mensais (formato YYYY-MM, máximo 24 meses), com comparação mês a mês. Use para perguntas como 'quanto gastei com mercado entre janeiro e março'.",
			inputSchema: z.object({
				startPeriod: periodSchema.describe("Período inicial, formato YYYY-MM"),
				endPeriod: periodSchema.describe("Período final, formato YYYY-MM"),
				categoryIds: z
					.array(z.string().uuid())
					.optional()
					.describe("Filtra por categorias específicas (opcional)"),
			}),
		},
		async ({ startPeriod, endPeriod, categoryIds }, ctx) => {
			const userId = requireUserId(ctx);

			const validation = validateDateRange(startPeriod, endPeriod);
			if (!validation.isValid) {
				throw new Error(validation.error ?? "Intervalo de período inválido.");
			}

			const report = await fetchCategoryReport(userId, {
				startPeriod,
				endPeriod,
				categoryIds,
			});

			return jsonResult({
				periods: report.periods,
				grandTotal: report.grandTotal,
				totalsByPeriod: Object.fromEntries(report.totals),
				categories: report.categories
					.map((c) => ({
						categoryId: c.categoryId,
						name: c.name,
						type: c.type,
						total: c.total,
						monthlyData: Object.fromEntries(c.monthlyData),
					}))
					.sort((a, b) => b.total - a.total),
			});
		},
	);

	server.registerTool(
		"create_transaction",
		{
			title: "Adicionar lançamento",
			description:
				"Cria um novo lançamento (despesa ou receita) à vista para o usuário autenticado. Descubra os IDs de categoria e conta antes com list_categories e list_accounts — a categoria precisa ser do mesmo tipo (despesa/receita) do lançamento. Não cobre parcelamento, recorrência, pagamento no cartão de crédito nem divisão entre pessoas — para esses casos, oriente o usuário a usar o app.",
			inputSchema: z.object({
				name: z
					.string()
					.trim()
					.min(1)
					.describe("Descrição/estabelecimento do lançamento"),
				amount: z
					.number()
					.positive()
					.describe(
						"Valor do lançamento, sempre positivo — o campo type define o sinal",
					),
				type: z.enum(["despesa", "receita"]).describe("Tipo do lançamento"),
				categoryId: z
					.string()
					.uuid()
					.describe(
						"ID da categoria (ver list_categories) — precisa ser do mesmo tipo informado em type",
					),
				accountId: z
					.string()
					.uuid()
					.describe(
						"ID da conta financeira que paga/recebe (ver list_accounts)",
					),
				date: dateSchema
					.optional()
					.describe("Data de compra, formato YYYY-MM-DD (padrão: hoje)"),
				paymentMethod: z
					.enum(WRITABLE_PAYMENT_METHODS)
					.optional()
					.describe(
						"Forma de pagamento (padrão: Pix). Pagamento no cartão de crédito não é suportado aqui.",
					),
				costCenterId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"ID do centro de custo — só relevante para despesa; se omitido, usa o centro de custo padrão 'Variável' do usuário",
					),
				note: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe("Anotação opcional"),
				isSettled: z
					.boolean()
					.optional()
					.describe("Já foi pago/recebido? (padrão: true)"),
			}),
		},
		async (
			{
				name,
				amount,
				type,
				categoryId,
				accountId,
				date,
				paymentMethod,
				costCenterId,
				note,
				isSettled,
			},
			ctx,
		) => {
			const userId = requireWriteScope(ctx);

			const category = await db.query.categories.findFirst({
				where: and(
					eq(categories.id, categoryId),
					eq(categories.userId, userId),
				),
			});
			if (!category) throw new Error("Categoria não encontrada.");
			if (category.type !== type) {
				throw new Error(
					`A categoria "${category.name}" é do tipo "${category.type}", mas o lançamento é "${type}".`,
				);
			}

			const account = await db.query.financialAccounts.findFirst({
				where: and(
					eq(financialAccounts.id, accountId),
					eq(financialAccounts.userId, userId),
				),
			});
			if (!account) throw new Error("Conta não encontrada.");

			let resolvedCostCenterId: string | null = null;
			if (costCenterId) {
				const costCenter = await db.query.costCenters.findFirst({
					where: and(
						eq(costCenters.id, costCenterId),
						eq(costCenters.userId, userId),
					),
				});
				if (!costCenter) throw new Error("Centro de custo não encontrado.");
				resolvedCostCenterId = costCenter.id;
			} else if (type === "despesa") {
				const userCostCenters = await fetchOrSeedCostCentersForUser(userId);
				const defaultCostCenter =
					userCostCenters.find((c) => c.kind === "variavel") ??
					userCostCenters[0];
				resolvedCostCenterId = defaultCostCenter?.id ?? null;
			}

			const adminPayerId = await getAdminPayerId(userId);
			if (!adminPayerId) {
				throw new Error(
					"Pessoa com papel administrador não encontrada para este usuário.",
				);
			}

			const purchaseDateString = date ?? getBusinessDateString();
			const period = resolvePeriod(purchaseDateString);
			const amountSign = type === "despesa" ? -1 : 1;

			const [inserted] = await db
				.insert(transactions)
				.values({
					condition: "À vista",
					name: name.trim(),
					paymentMethod: paymentMethod ?? "Pix",
					note: note && note.length > 0 ? note : null,
					amount: formatDecimalForDbRequired(amount * amountSign),
					purchaseDate: parseLocalDateString(purchaseDateString),
					transactionType: TRANSACTION_TYPE_LABEL[type],
					period,
					isSettled: isSettled ?? true,
					costCenterId: resolvedCostCenterId,
					userId,
					accountId,
					categoryId,
					payerId: adminPayerId,
				})
				.returning({ id: transactions.id });

			if (!inserted) {
				throw new Error("Não foi possível criar o lançamento.");
			}

			const [row] = await fetchTransactionsWithRelations({
				filters: [
					eq(transactions.userId, userId),
					eq(transactions.id, inserted.id),
				],
			});

			return jsonResult({
				message: "Lançamento criado com sucesso.",
				transaction: row ? serializeTransaction(row) : { id: inserted.id },
			});
		},
	);
}
