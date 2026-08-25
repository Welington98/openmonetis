import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
	type BankConnection,
	bankConnections,
	categories,
	financialAccounts,
	type StatementLine,
	statementLines,
} from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import { fetchPendingInboxCount } from "@/features/inbox/queries";
import { fetchStatementCategorizationMode } from "@/features/settings/queries";
import type { SelectOption } from "@/features/transactions/components/types";
import {
	buildOptionSets,
	buildSluggedFilters,
} from "@/features/transactions/lib/page-helpers";
import { fetchTransactionFilterSources } from "@/features/transactions/queries";
import { db } from "@/shared/lib/db";
import { fetchPluggyAccounts } from "./lib/pluggy-client";

export type BankConnectionWithDisplay = Omit<
	BankConnection,
	"connectorName"
> & {
	/** Apelido, quando definido, no lugar do nome do conector. */
	connectorName: string;
	/** Nome oficial do conector no Pluggy, nunca sobrescrito pelo apelido. */
	officialConnectorName: string;
};

export async function fetchBankConnections(
	userId: string,
): Promise<BankConnectionWithDisplay[]> {
	return db
		.select({
			id: bankConnections.id,
			userId: bankConnections.userId,
			pluggyItemId: bankConnections.pluggyItemId,
			connectorName: sql<string>`coalesce(${bankConnections.nickname}, ${bankConnections.connectorName})`,
			officialConnectorName: bankConnections.connectorName,
			nickname: bankConnections.nickname,
			status: bankConnections.status,
			lastSyncedAt: bankConnections.lastSyncedAt,
			isActive: bankConnections.isActive,
			createdAt: bankConnections.createdAt,
		})
		.from(bankConnections)
		.where(eq(bankConnections.userId, userId))
		.orderBy(desc(bankConnections.createdAt));
}

export type StatementLineWithCategory = StatementLine & {
	categoryName: string | null;
	linkedFinancialAccountId: string | null;
};

export async function fetchStatementLines(
	userId: string,
	status: "unmatched" | "matched" | "ignored" | "all" = "unmatched",
): Promise<StatementLineWithCategory[]> {
	const rows = await db
		.select({
			line: statementLines,
			categoryName: categories.name,
			linkedFinancialAccountId: financialAccounts.id,
		})
		.from(statementLines)
		.leftJoin(categories, eq(statementLines.categoryId, categories.id))
		.leftJoin(
			financialAccounts,
			and(
				eq(financialAccounts.pluggyAccountId, statementLines.pluggyAccountId),
				eq(financialAccounts.userId, statementLines.userId),
			),
		)
		.where(
			status === "all"
				? eq(statementLines.userId, userId)
				: and(
						eq(statementLines.userId, userId),
						eq(statementLines.status, status),
					),
		)
		.orderBy(desc(statementLines.date));

	return rows.map(({ line, categoryName, linkedFinancialAccountId }) => ({
		...line,
		categoryName,
		linkedFinancialAccountId,
	}));
}

export async function fetchPluggyConfigured(): Promise<boolean> {
	return Boolean(
		process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET,
	);
}

export type ReconciliationAccountRow = {
	accountId: string;
	accountName: string;
	connectorName: string;
	localBalance: number;
	pluggyBalance: number | null; // null = não configurado ou falhou ao buscar
	pendingCount: number;
};

export type ReconciliationOverview = {
	pluggyConfigured: boolean;
	accounts: ReconciliationAccountRow[];
	pendingInboxCount: number;
};

/**
 * Painel de conciliação: para cada conta local vinculada a uma conexão
 * Pluggy, compara o saldo que o banco declara (ao vivo, via API) com o saldo
 * calculado localmente pelos lançamentos, e conta quantas linhas de extrato
 * dessa conta ainda estão pendentes de revisão. Traz também um contador
 * global de pré-lançamentos pendentes (Companion + PDF), já que esses não têm
 * vínculo com uma conta específica. Import de OFX/planilha não tem fila
 * persistente (é revisado inteiramente no momento do upload), por isso não
 * entra aqui como contador — só como atalho na tela.
 */
export type LinkedBankAccount = {
	id: string;
	name: string;
	pluggyAccountId: string | null;
	connectorName: string;
	pluggyItemId: string;
	connectionId: string;
};

/** Contas locais vinculadas a uma conta do Pluggy (via `financialAccounts.pluggyAccountId`). */
export async function fetchLinkedBankAccounts(
	userId: string,
): Promise<LinkedBankAccount[]> {
	return db
		.select({
			id: financialAccounts.id,
			name: financialAccounts.name,
			pluggyAccountId: financialAccounts.pluggyAccountId,
			connectorName: sql<string>`coalesce(${bankConnections.nickname}, ${bankConnections.connectorName})`,
			pluggyItemId: bankConnections.pluggyItemId,
			connectionId: bankConnections.id,
		})
		.from(financialAccounts)
		.innerJoin(
			bankConnections,
			eq(financialAccounts.bankConnectionId, bankConnections.id),
		)
		.where(
			and(
				eq(financialAccounts.userId, userId),
				isNotNull(financialAccounts.pluggyAccountId),
			),
		);
}

export async function fetchReconciliationOverview(
	userId: string,
): Promise<ReconciliationOverview> {
	const pluggyConfigured = await fetchPluggyConfigured();
	const linkedAccounts = await fetchLinkedBankAccounts(userId);

	const [dashboardAccounts, pendingLines, pendingInboxCount] =
		await Promise.all([
			fetchDashboardAccounts(userId),
			fetchStatementLines(userId, "unmatched"),
			fetchPendingInboxCount(userId),
		]);

	const localBalanceById = new Map(
		dashboardAccounts.accounts.map((account) => [account.id, account.balance]),
	);

	const pendingCountByAccountId = new Map<string, number>();
	for (const line of pendingLines) {
		if (!line.linkedFinancialAccountId) continue;
		pendingCountByAccountId.set(
			line.linkedFinancialAccountId,
			(pendingCountByAccountId.get(line.linkedFinancialAccountId) ?? 0) + 1,
		);
	}

	// Busca o saldo ao vivo no Pluggy uma vez por conexão (não por conta), e
	// nunca deixa a falha de uma conexão (ex.: credenciais expiradas) derrubar
	// o painel inteiro — só aquela(s) conta(s) ficam sem saldo declarado.
	const pluggyBalanceByAccountId = new Map<string, number>();
	if (pluggyConfigured) {
		const itemIds = [...new Set(linkedAccounts.map((a) => a.pluggyItemId))];
		await Promise.all(
			itemIds.map(async (itemId) => {
				try {
					const accounts = await fetchPluggyAccounts(itemId);
					for (const account of accounts) {
						pluggyBalanceByAccountId.set(account.id, account.balance);
					}
				} catch (error) {
					console.error(
						`[reconciliation] Falha ao buscar saldo da conexão ${itemId}:`,
						error,
					);
				}
			}),
		);
	}

	const accounts: ReconciliationAccountRow[] = linkedAccounts.map(
		(account) => ({
			accountId: account.id,
			accountName: account.name,
			connectorName: account.connectorName,
			localBalance: localBalanceById.get(account.id) ?? 0,
			pluggyBalance: account.pluggyAccountId
				? (pluggyBalanceByAccountId.get(account.pluggyAccountId) ?? null)
				: null,
			pendingCount: pendingCountByAccountId.get(account.id) ?? 0,
		}),
	);

	return { pluggyConfigured, accounts, pendingInboxCount };
}

export type ReconciliationWorkspaceData = {
	connections: BankConnectionWithDisplay[];
	linkedAccounts: LinkedBankAccount[];
	statementLines: StatementLineWithCategory[];
	pluggyConfigured: boolean;
	statementCategorizationMode: "manual" | "ai";
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
};

/** Tudo que a tela de Conciliação bancária (/bank-sync) precisa pra renderizar. */
export async function fetchReconciliationWorkspaceData(
	userId: string,
): Promise<ReconciliationWorkspaceData> {
	const [
		connections,
		linkedAccounts,
		lines,
		pluggyConfigured,
		statementCategorizationMode,
		dialogData,
	] = await Promise.all([
		fetchBankConnections(userId),
		fetchLinkedBankAccounts(userId),
		fetchStatementLines(userId, "all"),
		fetchPluggyConfigured(),
		fetchStatementCategorizationMode(userId),
		fetchBankSyncDialogData(userId),
	]);

	return {
		connections,
		linkedAccounts,
		statementLines: lines.filter((line) => line.status !== "ignored"),
		pluggyConfigured,
		statementCategorizationMode,
		...dialogData,
	};
}

/** Dados para o TransactionDialog reaproveitado na revisão de linhas de extrato. */
export async function fetchBankSyncDialogData(userId: string): Promise<{
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
}> {
	const filterSources = await fetchTransactionFilterSources(userId);
	const sluggedFilters = buildSluggedFilters(filterSources);

	const {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
	} = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	return {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
	};
}
