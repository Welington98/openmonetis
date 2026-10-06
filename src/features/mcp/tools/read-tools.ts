import type { McpServer } from "@modelcontextprotocol/server";
import { eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { transactions } from "@/db/schema";
import { fetchBalanceProjection } from "@/features/balances/queries";
import { fetchBudgetsForUser } from "@/features/budgets/queries";
import { fetchAllCardsForUser } from "@/features/cards/queries";
import { fetchDailyBudgetOverview } from "@/features/daily-budget/queries";
import { fetchInboxItemsPage } from "@/features/inbox/queries";
import {
	fetchCardData,
	fetchCardTransactions,
	fetchInvoiceData,
} from "@/features/invoices/queries";
import {
	dateSchema,
	jsonResult,
	periodSchema,
	requireUserId,
	toDateOnly,
} from "@/features/mcp/lib/helpers";
import { fetchAllNotesForUser } from "@/features/notes/queries";
import { fetchPayablesSnapshot } from "@/features/payables/queries";
import { fetchPayersForUser } from "@/features/payers/queries";
import { fetchBalanceSheetReport } from "@/features/reports/lib/balance-sheet-queries";
import { fetchCartoesReportData } from "@/features/reports/lib/cards-report-queries";
import { fetchSavingsGoalsForUser } from "@/features/savings-goals/queries";
import { fetchTransactionsPageWithRelations } from "@/features/transactions/queries";
import { getCurrentPeriod } from "@/shared/utils/period";

/**
 * Tools MCP somente-leitura que expõem as queries das demais features
 * (orçamentos, cartões, faturas, contas a pagar, orçamento diário, projeção de
 * saldo, metas, pessoas, extrato, relatórios, inbox e anotações). Toda tool
 * resolve o userId via `requireUserId` (token Bearer) — nunca por argumento.
 */
export function registerReadTools(server: McpServer) {
	server.registerTool(
		"list_budgets",
		{
			title: "Listar orçamentos do mês",
			description:
				"Lista os orçamentos por categoria de despesa de um período (YYYY-MM, padrão: mês atual) com o limite, quanto já foi gasto e o percentual consumido.",
			inputSchema: z.object({
				period: periodSchema
					.optional()
					.describe("Período YYYY-MM (padrão: mês atual)"),
			}),
		},
		async ({ period }, ctx) => {
			const userId = requireUserId(ctx);
			const selectedPeriod = period ?? getCurrentPeriod();
			const { budgets } = await fetchBudgetsForUser(userId, selectedPeriod);

			return jsonResult({
				period: selectedPeriod,
				totalBudget: budgets.reduce((sum, b) => sum + b.amount, 0),
				totalSpent: budgets.reduce((sum, b) => sum + b.spent, 0),
				budgets: budgets.map((b) => ({
					id: b.id,
					category: b.category
						? { id: b.category.id, name: b.category.name }
						: null,
					amount: b.amount,
					spent: b.spent,
					remaining: b.amount - b.spent,
					percentUsed: b.amount > 0 ? (b.spent / b.amount) * 100 : null,
				})),
			});
		},
	);

	server.registerTool(
		"list_cards",
		{
			title: "Listar cartões de crédito",
			description:
				"Lista os cartões de crédito do usuário com limite, limite em uso, limite disponível, dias de fechamento/vencimento e o valor/status da fatura atual.",
			inputSchema: z.object({
				includeArchived: z
					.boolean()
					.default(false)
					.describe("Incluir cartões arquivados (padrão: não)"),
			}),
		},
		async ({ includeArchived }, ctx) => {
			const userId = requireUserId(ctx);
			const { activeCards, archivedCards } = await fetchAllCardsForUser(userId);
			const rows = includeArchived
				? [...activeCards, ...archivedCards]
				: activeCards;

			return jsonResult(
				rows.map((c) => ({
					id: c.id,
					name: c.name,
					brand: c.brand,
					status: c.status,
					closingDay: c.closingDay,
					dueDay: c.dueDay,
					limit: c.limit,
					limitInUse: c.limitInUse,
					limitAvailable: c.limitAvailable,
					currentInvoice: {
						label: c.currentInvoiceLabel,
						amount: c.currentInvoiceAmount,
						status: c.currentInvoiceStatus,
					},
					account: { id: c.accountId, name: c.accountName },
				})),
			);
		},
	);

	server.registerTool(
		"get_invoice",
		{
			title: "Detalhar fatura de um cartão",
			description:
				"Retorna a fatura de um cartão em um período (YYYY-MM, padrão: mês atual): total, status de pagamento e as compras que a compõem. Descubra o cardId com list_cards.",
			inputSchema: z.object({
				cardId: z.string().uuid().describe("ID do cartão (ver list_cards)"),
				period: periodSchema
					.optional()
					.describe("Período da fatura YYYY-MM (padrão: mês atual)"),
			}),
		},
		async ({ cardId, period }, ctx) => {
			const userId = requireUserId(ctx);
			const selectedPeriod = period ?? getCurrentPeriod();

			const card = await fetchCardData(userId, cardId);
			if (!card) throw new Error("Cartão não encontrado.");

			const [invoice, rows] = await Promise.all([
				fetchInvoiceData(userId, cardId, selectedPeriod),
				fetchCardTransactions([
					eq(transactions.userId, userId),
					eq(transactions.cardId, cardId),
					eq(transactions.period, selectedPeriod),
				]),
			]);

			return jsonResult({
				card: {
					id: card.id,
					name: card.name,
					closingDay: card.closingDay,
					dueDay: card.dueDay,
					limit: Number(card.limit),
				},
				period: selectedPeriod,
				totalAmount: invoice.totalAmount,
				status: invoice.invoiceStatus,
				paymentDate: toDateOnly(invoice.paymentDate),
				amountPaid: invoice.amountPaid,
				purchases: rows.map((row) => ({
					id: row.id,
					name: row.name,
					amount: Number(row.amount),
					purchaseDate: toDateOnly(row.purchaseDate),
					installment:
						row.installmentCount && row.currentInstallment
							? `${row.currentInstallment}/${row.installmentCount}`
							: null,
					category: row.category?.name ?? null,
				})),
			});
		},
	);

	server.registerTool(
		"list_payables",
		{
			title: "Contas a pagar e a receber",
			description:
				"Lista contas a pagar (boletos/despesas pendentes e faturas de cartão em aberto) e valores a receber pendentes, com vencimento e valor.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const { payables, receivables } = await fetchPayablesSnapshot(userId);

			const serialize = (row: (typeof payables)[number]) => ({
				id: row.id,
				kind: row.kind,
				name: row.kind === "transaction" ? row.bill.name : row.invoice.cardName,
				dueDate: row.dueDate,
				amount: row.amount,
			});

			return jsonResult({
				totalPayable: payables.reduce((sum, r) => sum + r.amount, 0),
				totalReceivable: receivables.reduce((sum, r) => sum + r.amount, 0),
				payables: payables.map(serialize),
				receivables: receivables.map(serialize),
			});
		},
	);

	server.registerTool(
		"get_daily_budget",
		{
			title: "Orçamento diário",
			description:
				"Retorna a visão do orçamento diário de hoje: cota do dia, quanto já foi gasto hoje e no mês, saldo disponível, ritmo de gasto, economia acumulada e projeção dos próximos meses.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			return jsonResult(await fetchDailyBudgetOverview(userId));
		},
	);

	server.registerTool(
		"get_balance_projection",
		{
			title: "Projeção de saldo",
			description:
				"Projeta o saldo consolidado dia a dia a partir de um período inicial (YYYY-MM, padrão: mês atual), considerando lançamentos pendentes e futuros.",
			inputSchema: z.object({
				startPeriod: periodSchema
					.optional()
					.describe("Período inicial YYYY-MM (padrão: mês atual)"),
			}),
		},
		async ({ startPeriod }, ctx) => {
			const userId = requireUserId(ctx);
			return jsonResult(await fetchBalanceProjection(userId, { startPeriod }));
		},
	);

	server.registerTool(
		"list_savings_goals",
		{
			title: "Listar metas de economia",
			description:
				"Lista as metas de economia com valor alvo, saldo atual, progresso (%), data alvo, aporte mensal sugerido e conta de destino.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const { goals } = await fetchSavingsGoalsForUser(userId);
			return jsonResult(
				goals.map((g) => ({
					id: g.id,
					description: g.description,
					targetAmount: g.targetAmount,
					currentBalance: g.currentBalance,
					progress: g.progress,
					percent: g.percent,
					isReached: g.isReached,
					startDate: g.startDate,
					targetDate: g.targetDate,
					suggestedMonthlyContribution: g.suggestedMonthlyContribution,
					destinationAccount: g.destinationAccount
						? { id: g.destinationAccount.id, name: g.destinationAccount.name }
						: null,
				})),
			);
		},
	);

	server.registerTool(
		"list_payers",
		{
			title: "Listar pessoas",
			description:
				"Lista as pessoas (pagadores) cadastradas, incluindo a pessoa administradora e as compartilhadas com o usuário.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const { payers } = await fetchPayersForUser(userId);
			return jsonResult(
				payers.map((p) => ({
					id: p.id,
					name: p.name,
					email: p.email,
					status: p.status,
					role: p.role,
					note: p.note,
					canEdit: p.canEdit,
					sharedByName: p.sharedByName,
				})),
			);
		},
	);

	server.registerTool(
		"account_statement",
		{
			title: "Extrato de uma conta",
			description:
				"Lista os lançamentos de uma conta financeira específica, com filtro de datas. Descubra o accountId com list_accounts.",
			inputSchema: z.object({
				accountId: z
					.string()
					.uuid()
					.describe("ID da conta (ver list_accounts)"),
				startDate: dateSchema.optional().describe("Data inicial (inclusive)"),
				endDate: dateSchema.optional().describe("Data final (inclusive)"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.default(30)
					.describe("Máximo de lançamentos (padrão 30, máximo 100)"),
			}),
		},
		async ({ accountId, startDate, endDate, limit }, ctx) => {
			const userId = requireUserId(ctx);

			const filters = [
				eq(transactions.userId, userId),
				eq(transactions.accountId, accountId),
			];
			if (startDate) {
				filters.push(gte(transactions.purchaseDate, new Date(startDate)));
			}
			if (endDate) {
				filters.push(lte(transactions.purchaseDate, new Date(endDate)));
			}

			const { rows, totalItems } = await fetchTransactionsPageWithRelations({
				filters,
				page: 1,
				pageSize: limit,
			});

			return jsonResult({
				accountId,
				totalMatching: totalItems,
				returned: rows.length,
				transactions: rows.map((row) => ({
					id: row.id,
					name: row.name,
					amount: Number(row.amount),
					type: row.transactionType,
					purchaseDate: toDateOnly(row.purchaseDate),
					isSettled: row.isSettled,
					category: row.category?.name ?? null,
				})),
			});
		},
	);

	server.registerTool(
		"cards_report",
		{
			title: "Relatório de uso de cartões",
			description:
				"Relatório de uso dos cartões em um período (YYYY-MM, padrão: mês atual): uso vs limite de cada cartão e, se cardId for informado, o detalhamento (evolução mensal, categorias, maiores gastos e status das faturas).",
			inputSchema: z.object({
				period: periodSchema
					.optional()
					.describe("Período YYYY-MM (padrão: mês atual)"),
				cardId: z
					.string()
					.uuid()
					.optional()
					.describe("Detalhar um cartão específico (ver list_cards)"),
			}),
		},
		async ({ period, cardId }, ctx) => {
			const userId = requireUserId(ctx);
			return jsonResult(
				await fetchCartoesReportData(
					userId,
					period ?? getCurrentPeriod(),
					cardId ?? null,
				),
			);
		},
	);

	server.registerTool(
		"balance_sheet",
		{
			title: "Balanço patrimonial",
			description:
				"Balanço patrimonial: contas classificadas como ativo e passivo, com saldos e totais (patrimônio líquido).",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			return jsonResult(await fetchBalanceSheetReport(userId));
		},
	);

	server.registerTool(
		"list_inbox",
		{
			title: "Listar pré-lançamentos (inbox)",
			description:
				"Lista os itens do inbox (notificações bancárias capturadas pelo Companion e comprovantes) por status. Use 'pending' para o que aguarda revisão.",
			inputSchema: z.object({
				status: z
					.enum(["pending", "processed", "discarded"])
					.default("pending")
					.describe("Status dos itens (padrão: pending)"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.default(20)
					.describe("Máximo de itens (padrão 20, máximo 100)"),
			}),
		},
		async ({ status, limit }, ctx) => {
			const userId = requireUserId(ctx);
			const { items, pagination } = await fetchInboxItemsPage(userId, status, {
				page: 1,
				pageSize: limit,
			});

			return jsonResult({
				status,
				totalMatching: pagination.totalItems,
				returned: items.length,
				items: items.map((item) => ({
					id: item.id,
					itemType: item.itemType,
					sourceApp: item.sourceAppName ?? item.sourceApp,
					title: item.originalTitle,
					text: item.originalText,
					notificationTimestamp: item.notificationTimestamp.toISOString(),
					parsedName: item.parsedName,
					parsedAmount: item.parsedAmount,
					parsedDate: toDateOnly(item.parsedDate),
					transactionId: item.transactionId,
				})),
			});
		},
	);

	server.registerTool(
		"list_notes",
		{
			title: "Listar anotações",
			description:
				"Lista as anotações e listas de tarefas do usuário (ativas por padrão).",
			inputSchema: z.object({
				includeArchived: z
					.boolean()
					.default(false)
					.describe("Incluir anotações arquivadas (padrão: não)"),
			}),
		},
		async ({ includeArchived }, ctx) => {
			const userId = requireUserId(ctx);
			const { activeNotes, archivedNotes } = await fetchAllNotesForUser(userId);
			const rows = includeArchived
				? [...activeNotes, ...archivedNotes]
				: activeNotes;

			return jsonResult(
				rows.map((n) => ({
					id: n.id,
					title: n.title,
					type: n.type,
					description: n.description,
					tasks: n.tasks ?? null,
					archived: n.archived,
					createdAt: n.createdAt,
				})),
			);
		},
	);
}
