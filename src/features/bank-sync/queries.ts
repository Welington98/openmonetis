import { and, desc, eq } from "drizzle-orm";
import {
	type BankConnection,
	bankConnections,
	categories,
	type StatementLine,
	statementLines,
} from "@/db/schema";
import type { SelectOption } from "@/features/transactions/components/types";
import {
	buildOptionSets,
	buildSluggedFilters,
} from "@/features/transactions/lib/page-helpers";
import { fetchTransactionFilterSources } from "@/features/transactions/queries";
import { db } from "@/shared/lib/db";

export async function fetchBankConnections(
	userId: string,
): Promise<BankConnection[]> {
	return db
		.select()
		.from(bankConnections)
		.where(eq(bankConnections.userId, userId))
		.orderBy(desc(bankConnections.createdAt));
}

export type StatementLineWithCategory = StatementLine & {
	categoryName: string | null;
};

export async function fetchStatementLines(
	userId: string,
	status: "unmatched" | "matched" | "ignored" = "unmatched",
): Promise<StatementLineWithCategory[]> {
	const rows = await db
		.select({
			line: statementLines,
			categoryName: categories.name,
		})
		.from(statementLines)
		.leftJoin(categories, eq(statementLines.categoryId, categories.id))
		.where(
			and(eq(statementLines.userId, userId), eq(statementLines.status, status)),
		)
		.orderBy(desc(statementLines.date));

	return rows.map(({ line, categoryName }) => ({ ...line, categoryName }));
}

export async function fetchPluggyConfigured(): Promise<boolean> {
	return Boolean(
		process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET,
	);
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
