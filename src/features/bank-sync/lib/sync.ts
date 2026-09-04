import { and, eq } from "drizzle-orm";
import {
	bankConnections,
	cards,
	financialAccounts,
	statementLines,
} from "@/db/schema";
import { fetchCategoryMappings } from "@/features/transactions/actions/category-memory-action";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import { db } from "@/shared/lib/db";
import { toDateOnlyString } from "@/shared/utils/date";
import {
	fetchPluggyAccounts,
	fetchPluggyItem,
	fetchPluggyTransactions,
	type PluggyTransaction,
} from "./pluggy-client";

export type SyncResult = {
	connectionId: string;
	accountsSynced: number;
	statementLinesCreated: number;
};

export type SyncDateRange = {
	dateFrom?: string;
	dateTo?: string;
};

function pluggyTypeToLocal(
	type: PluggyTransaction["type"],
): "despesa" | "receita" {
	return type === "DEBIT" ? "despesa" : "receita";
}

/**
 * Sincroniza uma conexão bancária: busca contas + transações novas no Pluggy
 * e grava como `linhas_extrato` pendentes de revisão (nunca cria lançamento
 * direto). Dedup por `externalId` via `ON CONFLICT DO NOTHING` no índice
 * único — chamadas repetidas são idempotentes.
 *
 * `dateRange` permite filtrar manualmente por período (ex.: só reimportar um
 * mês específico); quando omitido, usa o comportamento padrão: histórico
 * completo na primeira sincronização, e uma janela incremental dos últimos
 * 30 dias nas seguintes.
 */
export async function syncBankConnection(
	connectionId: string,
	userId: string,
	dateRange: SyncDateRange = {},
): Promise<SyncResult> {
	const [connection] = await db
		.select()
		.from(bankConnections)
		.where(
			and(
				eq(bankConnections.id, connectionId),
				eq(bankConnections.userId, userId),
			),
		)
		.limit(1);

	if (!connection) {
		throw new Error("Conexão bancária não encontrada.");
	}

	const item = await fetchPluggyItem(connection.pluggyItemId);
	const pluggyAccounts = await fetchPluggyAccounts(connection.pluggyItemId);

	// Vincula contas/cartões locais já associados a esta conexão, para saber a
	// partir de quando buscar transações incrementalmente (evita reprocessar
	// tudo).
	const [linkedAccounts, linkedCards] = await Promise.all([
		db
			.select({ id: financialAccounts.id })
			.from(financialAccounts)
			.where(
				and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.bankConnectionId, connectionId),
				),
			),
		db
			.select({ id: cards.id })
			.from(cards)
			.where(
				and(eq(cards.userId, userId), eq(cards.bankConnectionId, connectionId)),
			),
	]);
	const hasLinkedAccounts = linkedAccounts.length > 0 || linkedCards.length > 0;

	let statementLinesCreated = 0;

	// Um período explícito (filtro manual) sempre tem prioridade sobre a
	// janela incremental padrão de 30 dias.
	const dateFrom =
		dateRange.dateFrom ??
		(hasLinkedAccounts
			? (toDateOnlyString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) ??
				undefined)
			: undefined);
	const dateTo = dateRange.dateTo;

	for (const account of pluggyAccounts) {
		const pluggyTransactions = await fetchPluggyTransactions(account.id, {
			dateFrom,
			dateTo,
		});

		if (pluggyTransactions.length === 0) continue;

		// Categoria sugerida de graça: reaproveita o mesmo mapeamento
		// descrição → categoria que o import de OFX usa (sem chamar IA aqui —
		// isso é feito sob demanda/em lote, é pago e o usuário escolhe quando).
		const categoryMappings = await fetchCategoryMappings(
			pluggyTransactions.map((t) => t.description),
		);

		const rows = pluggyTransactions.map((transaction) => {
			const suggestedCategoryId =
				categoryMappings[normalizeDescriptionKey(transaction.description)];
			return {
				userId,
				bankConnectionId: connectionId,
				pluggyAccountId: transaction.accountId,
				pluggyAccountType: account.type,
				date: new Date(transaction.date),
				description: transaction.description,
				amount: Math.abs(transaction.amount).toFixed(2),
				type: pluggyTypeToLocal(transaction.type),
				externalId: transaction.id,
				categoryId: suggestedCategoryId ?? null,
				categorySource: suggestedCategoryId ? "mapping" : null,
			};
		});

		const inserted = await db
			.insert(statementLines)
			.values(rows)
			.onConflictDoNothing({ target: statementLines.externalId })
			.returning({ id: statementLines.id });

		statementLinesCreated += inserted.length;
	}

	await db
		.update(bankConnections)
		.set({
			status: item.status,
			lastSyncedAt: new Date(),
		})
		.where(eq(bankConnections.id, connectionId));

	return {
		connectionId,
		accountsSynced: pluggyAccounts.length,
		statementLinesCreated,
	};
}

/** Roda o sync para todas as conexões ativas de todos os usuários — usado pela rota de cron. */
export async function syncAllActiveConnections(): Promise<SyncResult[]> {
	const activeConnections = await db
		.select({ id: bankConnections.id, userId: bankConnections.userId })
		.from(bankConnections)
		.where(eq(bankConnections.isActive, true));

	const results: SyncResult[] = [];
	for (const connection of activeConnections) {
		try {
			results.push(await syncBankConnection(connection.id, connection.userId));
		} catch (error) {
			console.error(
				`[pluggy-sync] Falha ao sincronizar conexão ${connection.id}:`,
				error,
			);
		}
	}
	return results;
}
