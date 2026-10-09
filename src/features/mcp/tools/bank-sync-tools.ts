import type { McpServer } from "@modelcontextprotocol/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { categories, statementLines, transactions } from "@/db/schema";
import {
	fetchBankConnections,
	fetchReconciliationOverview,
	fetchStatementLines,
} from "@/features/bank-sync/queries";
import {
	jsonResult,
	requireUserId,
	requireWriteScope,
	toDateOnly,
} from "@/features/mcp/lib/helpers";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";

/**
 * Tools MCP da conciliação bancária (Pluggy). Toda tool resolve o userId pelo
 * token Bearer — nunca por argumento. As de escrita exigem `finance:write` e só
 * triam linhas de extrato pendentes; não conectam, removem nem sincronizam
 * conexões (esses fluxos ficam só no app). O `pluggyItemId` nunca é exposto.
 */
export function registerBankSyncTools(server: McpServer) {
	server.registerTool(
		"list_bank_connections",
		{
			title: "Listar conexões bancárias (Pluggy)",
			description:
				"Lista as conexões bancárias do Pluggy com o nome do conector (ou apelido), status, se está ativa e a data da última sincronização.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const connections = await fetchBankConnections(userId);

			return jsonResult(
				connections.map((c) => ({
					id: c.id,
					name: c.connectorName,
					officialName: c.officialConnectorName,
					status: c.status,
					isActive: c.isActive,
					lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
				})),
			);
		},
	);

	server.registerTool(
		"list_statement_lines",
		{
			title: "Listar linhas de extrato bancário",
			description:
				"Lista as linhas de extrato importadas do banco via Pluggy. Por padrão traz só as pendentes de conciliação (unmatched), da mais recente para a mais antiga, com categoria sugerida e a conta/cartão local vinculado.",
			inputSchema: z.object({
				status: z
					.enum(["unmatched", "matched", "ignored", "all"])
					.default("unmatched")
					.describe("Status das linhas (padrão: unmatched = pendentes)"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(200)
					.default(50)
					.describe("Máximo de linhas retornadas (padrão 50, máx. 200)"),
			}),
		},
		async ({ status, limit }, ctx) => {
			const userId = requireUserId(ctx);
			const lines = await fetchStatementLines(userId, status);

			return jsonResult({
				total: lines.length,
				lines: lines.slice(0, limit).map((l) => ({
					id: l.id,
					date: toDateOnly(l.date),
					description: l.description,
					amount: Number(l.amount),
					type: l.type,
					status: l.status,
					category: l.categoryId
						? { id: l.categoryId, name: l.categoryName }
						: null,
					categorySource: l.categorySource,
					accountId: l.linkedFinancialAccountId,
					cardId: l.linkedCardId,
					matchedTransactionId: l.matchedTransactionId,
				})),
			});
		},
	);

	server.registerTool(
		"reconciliation_overview",
		{
			title: "Painel de conciliação bancária",
			description:
				"Para cada conta vinculada ao Pluggy, compara o saldo calculado localmente com o saldo declarado pelo banco (ao vivo, pode vir null se a consulta falhar) e informa quantas linhas de extrato estão pendentes. Traz também a contagem de itens pendentes no inbox.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const overview = await fetchReconciliationOverview(userId);

			return jsonResult({
				pluggyConfigured: overview.pluggyConfigured,
				pendingInboxCount: overview.pendingInboxCount,
				accounts: overview.accounts.map((a) => ({
					accountId: a.accountId,
					accountName: a.accountName,
					connectorName: a.connectorName,
					localBalance: a.localBalance,
					bankBalance: a.pluggyBalance,
					difference:
						a.pluggyBalance === null
							? null
							: Number((a.pluggyBalance - a.localBalance).toFixed(2)),
					pendingCount: a.pendingCount,
				})),
			});
		},
	);

	server.registerTool(
		"ignore_statement_line",
		{
			title: "Ignorar linha de extrato",
			description:
				"Marca uma linha de extrato pendente como ignorada (ex.: movimentação que não deve virar lançamento). Descubra o id com list_statement_lines.",
			inputSchema: z.object({
				statementLineId: z
					.string()
					.uuid()
					.describe("ID da linha (ver list_statement_lines)"),
			}),
		},
		async ({ statementLineId }, ctx) => {
			const userId = requireWriteScope(ctx);

			const updated = await db
				.update(statementLines)
				.set({ status: "ignored" })
				.where(
					and(
						eq(statementLines.id, statementLineId),
						eq(statementLines.userId, userId),
						eq(statementLines.status, "unmatched"),
					),
				)
				.returning({ id: statementLines.id });
			if (updated.length === 0) {
				throw new Error("Linha não encontrada ou já tratada.");
			}

			revalidateForEntity("bankSync", userId);

			return jsonResult({ message: "Linha ignorada.", statementLineId });
		},
	);

	server.registerTool(
		"match_statement_line",
		{
			title: "Vincular linha de extrato a um lançamento",
			description:
				"Concilia uma linha de extrato pendente com um lançamento já existente (ver list_transactions), marcando-a como casada.",
			inputSchema: z.object({
				statementLineId: z
					.string()
					.uuid()
					.describe("ID da linha (ver list_statement_lines)"),
				transactionId: z
					.string()
					.uuid()
					.describe("ID do lançamento a vincular (ver list_transactions)"),
			}),
		},
		async ({ statementLineId, transactionId }, ctx) => {
			const userId = requireWriteScope(ctx);

			const transaction = await db.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.id, transactionId),
					eq(transactions.userId, userId),
				),
			});
			if (!transaction) throw new Error("Lançamento não encontrado.");

			const updated = await db
				.update(statementLines)
				.set({ status: "matched", matchedTransactionId: transactionId })
				.where(
					and(
						eq(statementLines.id, statementLineId),
						eq(statementLines.userId, userId),
						eq(statementLines.status, "unmatched"),
					),
				)
				.returning({ id: statementLines.id });
			if (updated.length === 0) {
				throw new Error("Linha não encontrada ou já tratada.");
			}

			revalidateForEntity("bankSync", userId);

			return jsonResult({
				message: "Linha vinculada ao lançamento.",
				statementLineId,
				transactionId,
			});
		},
	);

	server.registerTool(
		"set_statement_line_category",
		{
			title: "Definir categoria de uma linha de extrato",
			description:
				"Define (ou limpa, com categoryId null) a categoria de uma linha de extrato, usada ao transformá-la em lançamento. Descubra categorias com list_categories.",
			inputSchema: z.object({
				statementLineId: z
					.string()
					.uuid()
					.describe("ID da linha (ver list_statement_lines)"),
				categoryId: z
					.string()
					.uuid()
					.nullable()
					.describe(
						"ID da categoria (ver list_categories) ou null para limpar",
					),
			}),
		},
		async ({ statementLineId, categoryId }, ctx) => {
			const userId = requireWriteScope(ctx);

			if (categoryId) {
				const category = await db.query.categories.findFirst({
					columns: { id: true },
					where: and(
						eq(categories.id, categoryId),
						eq(categories.userId, userId),
					),
				});
				if (!category) throw new Error("Categoria não encontrada.");
			}

			const updated = await db
				.update(statementLines)
				.set({
					categoryId,
					categorySource: categoryId ? "manual" : null,
				})
				.where(
					and(
						eq(statementLines.id, statementLineId),
						eq(statementLines.userId, userId),
						eq(statementLines.status, "unmatched"),
					),
				)
				.returning({ id: statementLines.id });
			if (updated.length === 0) {
				throw new Error("Linha não encontrada ou já tratada.");
			}

			revalidateForEntity("bankSync", userId);

			return jsonResult({
				message: categoryId ? "Categoria atualizada." : "Categoria removida.",
				statementLineId,
				categoryId,
			});
		},
	);
}
