import { and, eq } from "drizzle-orm";
import {
	bankConnections,
	financialAccounts,
	statementLines,
} from "@/db/schema";
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
 */
export async function syncBankConnection(
	connectionId: string,
	userId: string,
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

	// Vincula contas locais já associadas a esta conexão, para saber a partir
	// de quando buscar transações incrementalmente (evita reprocessar tudo).
	const linkedAccounts = await db
		.select({ id: financialAccounts.id })
		.from(financialAccounts)
		.where(
			and(
				eq(financialAccounts.userId, userId),
				eq(financialAccounts.bankConnectionId, connectionId),
			),
		);
	const hasLinkedAccounts = linkedAccounts.length > 0;

	let statementLinesCreated = 0;

	for (const account of pluggyAccounts) {
		if (account.type !== "BANK") continue; // cartão de crédito fica fora do v1

		const dateFrom = hasLinkedAccounts
			? (toDateOnlyString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) ??
				undefined)
			: undefined;

		const pluggyTransactions = await fetchPluggyTransactions(account.id, {
			dateFrom,
		});

		if (pluggyTransactions.length === 0) continue;

		const rows = pluggyTransactions.map((transaction) => ({
			userId,
			bankConnectionId: connectionId,
			pluggyAccountId: transaction.accountId,
			date: new Date(transaction.date),
			description: transaction.description,
			amount: Math.abs(transaction.amount).toFixed(2),
			type: pluggyTypeToLocal(transaction.type),
			externalId: transaction.id,
		}));

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
