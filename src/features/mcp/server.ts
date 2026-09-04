import type { BaseContext, McpServer } from "@modelcontextprotocol/server";
import { and, eq, gte, ilike, lte } from "drizzle-orm";
import { z } from "zod";
import { categories, transactions } from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import { fetchCategoryReport } from "@/features/reports/lib/category-report-queries";
import { validateDateRange } from "@/features/reports/lib/utils";
import {
	fetchTransactionsPageWithRelations,
	fetchTransactionsWithRelations,
} from "@/features/transactions/queries";
import { db } from "@/shared/lib/db";

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
 * Registra as tools MCP somente-leitura de consulta financeira. userId nunca
 * vem dos argumentos da tool — só do token Bearer verificado (ctx.http.authInfo),
 * então uma tool jamais pode ler dados de outro usuário.
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
			if (type) filters.push(eq(transactions.transactionType, type));
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
}
