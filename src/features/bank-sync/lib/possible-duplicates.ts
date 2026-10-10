import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { statementLines, transactions } from "@/db/schema";
import { detectInstallmentFromName } from "@/features/transactions/lib/installment-detection";
import { db } from "@/shared/lib/db";
import { matchLinesToTransactions } from "@/shared/lib/matching/transaction-matching";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import {
	addDays,
	parseLocalDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import type { StatementLineWithCategory } from "../queries";

const WINDOW_DAYS = 3;

export type StatementLinePossibleDuplicate = {
	transactionId: string;
	name: string;
	purchaseDate: string;
	amount: number;
};

/**
 * Pra cada linha pendente com conta/cartão vinculado, procura um lançamento já
 * existente que pareça ser a mesma transação (lançado à mão, importado de
 * arquivo…). Lançamentos já vinculados a outra linha de extrato ficam de fora.
 * Só sugere — o usuário confirma vinculando ou importando mesmo assim.
 */
export async function fetchPossibleDuplicates(
	userId: string,
	lines: StatementLineWithCategory[],
): Promise<Map<string, StatementLinePossibleDuplicate>> {
	const result = new Map<string, StatementLinePossibleDuplicate>();
	const pending = lines.filter(
		(line) =>
			line.status === "unmatched" &&
			(line.pluggyAccountType === "CREDIT"
				? line.linkedCardId
				: line.linkedFinancialAccountId),
	);
	if (pending.length === 0) return result;

	const dateStrings = pending
		.map((line) => toDateOnlyString(line.date))
		.filter((value): value is string => Boolean(value))
		.sort();
	if (dateStrings.length === 0) return result;

	const accountIds = [
		...new Set(
			pending.flatMap((line) =>
				line.pluggyAccountType !== "CREDIT" && line.linkedFinancialAccountId
					? [line.linkedFinancialAccountId]
					: [],
			),
		),
	];
	const cardIds = [
		...new Set(
			pending.flatMap((line) =>
				line.pluggyAccountType === "CREDIT" && line.linkedCardId
					? [line.linkedCardId]
					: [],
			),
		),
	];
	const signedAmounts = [
		...new Set(
			pending.map((line) =>
				formatDecimalForDbRequired(
					line.type === "receita"
						? Math.abs(Number(line.amount))
						: -Math.abs(Number(line.amount)),
				),
			),
		),
	];

	const destinationFilters = [
		accountIds.length > 0 ? inArray(transactions.accountId, accountIds) : null,
		cardIds.length > 0 ? inArray(transactions.cardId, cardIds) : null,
	].filter((filter) => filter !== null);

	const candidates = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			installmentCount: transactions.installmentCount,
			currentInstallment: transactions.currentInstallment,
			accountId: transactions.accountId,
			cardId: transactions.cardId,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				or(...destinationFilters),
				inArray(transactions.amount, signedAmounts),
				or(
					and(
						gte(
							transactions.purchaseDate,
							parseLocalDateString(
								addDays(dateStrings[0] as string, -WINDOW_DAYS),
							),
						),
						lte(
							transactions.purchaseDate,
							parseLocalDateString(
								addDays(
									dateStrings[dateStrings.length - 1] as string,
									WINDOW_DAYS,
								),
							),
						),
					),
					// Parcelas mantêm a data da compra original.
					sql`${transactions.installmentCount} IS NOT NULL`,
				),
				sql`NOT EXISTS (
					SELECT 1 FROM ${statementLines}
					WHERE ${statementLines.matchedTransactionId} = ${transactions.id}
				)`,
			),
		);
	if (candidates.length === 0) return result;

	const consumed = new Set<string>();
	const destinationKeys = [
		...new Set(
			pending.map((line) =>
				line.pluggyAccountType === "CREDIT"
					? `card:${line.linkedCardId}`
					: `account:${line.linkedFinancialAccountId}`,
			),
		),
	];

	for (const key of destinationKeys) {
		const group = pending.filter(
			(line) =>
				(line.pluggyAccountType === "CREDIT"
					? `card:${line.linkedCardId}`
					: `account:${line.linkedFinancialAccountId}`) === key,
		);
		const groupCandidates = candidates
			.filter(
				(candidate) =>
					!consumed.has(candidate.id) &&
					(key.startsWith("card:")
						? `card:${candidate.cardId}` === key
						: `account:${candidate.accountId}` === key),
			)
			.map((candidate) => ({
				id: candidate.id,
				name: candidate.name,
				amount: Number(candidate.amount),
				purchaseDate: candidate.purchaseDate,
				transactionType: candidate.transactionType,
				installmentCount: candidate.installmentCount,
				currentInstallment: candidate.currentInstallment,
			}));
		const byId = new Map(groupCandidates.map((c) => [c.id, c]));

		const matches = matchLinesToTransactions(
			group.map((line) => {
				const installment = detectInstallmentFromName(line.description);
				return {
					description: installment?.name ?? line.description,
					amount: Number(line.amount),
					date: line.date,
					transactionType: line.type === "receita" ? "Receita" : "Despesa",
					installment: installment
						? {
								current: installment.currentInstallment,
								total: installment.installmentCount,
							}
						: null,
				};
			}),
			groupCandidates,
		);

		group.forEach((line, index) => {
			const match = matches[index];
			const candidate = match ? byId.get(match.transactionId) : null;
			if (!candidate) return;
			consumed.add(candidate.id);
			result.set(line.id, {
				transactionId: candidate.id,
				name: candidate.name,
				purchaseDate: toDateOnlyString(candidate.purchaseDate) ?? "",
				amount: candidate.amount,
			});
		});
	}

	return result;
}
