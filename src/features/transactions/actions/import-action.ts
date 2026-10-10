"use server";

import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { transactions } from "@/db/schema";
import {
	fetchOwnedCategoryIds,
	fetchOwnedPayerIds,
	validateCartaoOwnership,
	validateContaOwnership,
} from "@/features/transactions/actions/core";
import { createOfxImportFingerprint } from "@/features/transactions/lib/ofx-import-fingerprint";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	normalizeOfxIdentityText,
	type OfxIdentityRow,
	type OfxImportDestination,
} from "@/shared/lib/import/ofx-identity";
import { matchLinesToTransactions } from "@/shared/lib/matching/transaction-matching";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import {
	addDays,
	parseLocalDateString,
	toDateOnlyString,
} from "@/shared/utils/date";
import { addMonthsToPeriod } from "@/shared/utils/period";

const ofxIdentityRowSchema = z.object({
	externalId: z.string().nullable(),
	externalIdOccurrence: z.number().int().nonnegative(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
	amount: z.number().positive(),
	transactionType: z.enum(["income", "expense"]),
	sourceDescription: z.string(),
});

const ofxImportDestinationSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("account"), id: uuidSchema("Conta") }),
	z.object({ type: z.literal("card"), id: uuidSchema("Cartão") }),
]);

const duplicateCheckRowSchema = ofxIdentityRowSchema.extend({
	// Descrição já limpa (sem o sufixo de parcela) e parcela detectada, usadas só
	// na busca por possíveis duplicatas entre lançamentos já existentes.
	description: z.string().optional(),
	installmentCurrent: z.number().int().nullable().optional(),
	installmentTotal: z.number().int().nullable().optional(),
});

const duplicateCheckSchema = z.object({
	source: z.string().min(1),
	accountNumber: z.string().nullable(),
	destination: ofxImportDestinationSchema,
	rows: z.array(duplicateCheckRowSchema),
});

const importRowSchema = ofxIdentityRowSchema
	.extend({
		description: z.string().min(1, "Descrição obrigatória."),
		categoryId: uuidSchema("Category").nullable().optional(),
		payerId: uuidSchema("Payer").nullable().optional(),
		// Linha de uma compra parcelada: `amount` é o valor de UMA parcela, a
		// linha importada é a `currentInstallment` e as seguintes até
		// `installmentCount` são criadas nos meses seguintes.
		installmentCount: z.number().int().min(2).max(60).nullable().optional(),
		currentInstallment: z.number().int().min(1).nullable().optional(),
	})
	.refine(
		(row) =>
			!row.installmentCount ||
			!row.currentInstallment ||
			row.currentInstallment <= row.installmentCount,
		{ message: "A parcela atual não pode ser maior que o total." },
	);

const importSchema = z.object({
	source: z.string().min(1),
	accountNumber: z.string().nullable(),
	rows: z.array(importRowSchema).min(1, "Selecione ao menos uma transação."),
	payerId: uuidSchema("Payer").nullable().optional(),
	accountId: uuidSchema("FinancialAccount").nullable().optional(),
	cardId: uuidSchema("Cartão").nullable().optional(),
	paymentMethod: z.string().min(1),
	invoicePeriod: z
		.string()
		.regex(/^\d{4}-\d{2}$/, "Período inválido.")
		.nullable()
		.optional(),
});

type ImportInput = z.infer<typeof importSchema>;

type ImportResult =
	| { success: true; imported: number; skipped: number; importBatchId: string }
	| { success: false; error: string };

export type PossibleDuplicate = {
	transactionId: string;
	name: string;
	purchaseDate: string;
	amount: number;
};

type ImportMatch = {
	fingerprint: string | null;
	existingTransactionId: string | null;
	possibleDuplicate?: PossibleDuplicate | null;
};

const POSSIBLE_DUPLICATE_WINDOW_DAYS = 3;

type LegacyImportCandidate = {
	id: string;
	name: string;
	amount: string;
	purchaseDate: Date;
	transactionType: string;
	ofxFitId: string | null;
	accountId: string | null;
	cardId: string | null;
};

function isDestinationMatch(
	candidate: LegacyImportCandidate,
	destination: OfxImportDestination,
): boolean {
	return destination.type === "card"
		? candidate.cardId === destination.id
		: candidate.accountId === destination.id;
}

function isLegacyImportMatch(
	candidate: LegacyImportCandidate,
	row: OfxIdentityRow,
	destination: OfxImportDestination,
): boolean {
	if (
		!row.externalId ||
		row.externalIdOccurrence !== 0 ||
		candidate.ofxFitId !== row.externalId ||
		!isDestinationMatch(candidate, destination)
	) {
		return false;
	}

	const expectedType = row.transactionType === "income" ? "Receita" : "Despesa";
	const signedAmount =
		row.transactionType === "expense" ? -row.amount : row.amount;

	return (
		toDateOnlyString(candidate.purchaseDate) === row.date &&
		formatDecimalForDbRequired(Number(candidate.amount)) ===
			formatDecimalForDbRequired(signedAmount) &&
		candidate.transactionType === expectedType &&
		normalizeOfxIdentityText(candidate.name) ===
			normalizeOfxIdentityText(row.sourceDescription)
	);
}

async function findExistingImports(
	userId: string,
	source: string,
	accountNumber: string | null,
	destination: OfxImportDestination,
	rows: OfxIdentityRow[],
): Promise<ImportMatch[]> {
	const fingerprints = rows.map((row) =>
		createOfxImportFingerprint({
			source,
			accountNumber,
			destination,
			row,
		}),
	);
	const fingerprintValues = [
		...new Set(
			fingerprints.filter(
				(fingerprint): fingerprint is string => fingerprint !== null,
			),
		),
	];
	const fitIds = [
		...new Set(
			rows
				.map((row) => row.externalId)
				.filter((fitId): fitId is string => fitId !== null),
		),
	];

	const [fingerprintMatches, legacyCandidates] = await Promise.all([
		fingerprintValues.length > 0
			? db
					.select({
						id: transactions.id,
						fingerprint: transactions.ofxImportFingerprint,
					})
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							inArray(transactions.ofxImportFingerprint, fingerprintValues),
						),
					)
			: Promise.resolve([]),
		fitIds.length > 0
			? db
					.select({
						id: transactions.id,
						name: transactions.name,
						amount: transactions.amount,
						purchaseDate: transactions.purchaseDate,
						transactionType: transactions.transactionType,
						ofxFitId: transactions.ofxFitId,
						accountId: transactions.accountId,
						cardId: transactions.cardId,
					})
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							isNull(transactions.ofxImportFingerprint),
							inArray(transactions.ofxFitId, fitIds),
						),
					)
			: Promise.resolve([]),
	]);

	const transactionIdByFingerprint = new Map(
		fingerprintMatches.flatMap((match) =>
			match.fingerprint ? [[match.fingerprint, match.id] as const] : [],
		),
	);
	const consumedLegacyIds = new Set<string>();

	return rows.map((row, index) => {
		const fingerprint = fingerprints[index] ?? null;
		const currentTransactionId = fingerprint
			? (transactionIdByFingerprint.get(fingerprint) ?? null)
			: null;

		if (currentTransactionId) {
			return { fingerprint, existingTransactionId: currentTransactionId };
		}

		const legacyMatch = legacyCandidates.find(
			(candidate) =>
				!consumedLegacyIds.has(candidate.id) &&
				isLegacyImportMatch(candidate, row, destination),
		);

		if (legacyMatch) {
			consumedLegacyIds.add(legacyMatch.id);
		}

		return {
			fingerprint,
			existingTransactionId: legacyMatch?.id ?? null,
		};
	});
}

async function validateDestinationOwnership(
	userId: string,
	destination: OfxImportDestination,
): Promise<boolean> {
	return destination.type === "card"
		? validateCartaoOwnership(userId, destination.id)
		: validateContaOwnership(userId, destination.id);
}

export async function checkDuplicateOfxTransactions(
	input: unknown,
): Promise<
	{ success: true; rows: ImportMatch[] } | { success: false; error: string }
> {
	const userId = await getUserId();
	const parsed = duplicateCheckSchema.safeParse(input);

	if (!parsed.success) {
		return { success: false, error: "Dados do arquivo inválidos." };
	}

	const { source, accountNumber, destination, rows } = parsed.data;
	if (!(await validateDestinationOwnership(userId, destination))) {
		return { success: false, error: "Conta ou cartão não encontrado." };
	}

	const matches = await findExistingImports(
		userId,
		source,
		accountNumber,
		destination,
		rows,
	);
	const possibleDuplicates = await findPossibleDuplicates(
		userId,
		destination,
		rows,
		matches,
	);

	return {
		success: true,
		rows: matches.map((match, index) => ({
			...match,
			possibleDuplicate: possibleDuplicates[index] ?? null,
		})),
	};
}

type DuplicateCheckRow = z.infer<typeof duplicateCheckRowSchema>;

/**
 * Linhas sem match exato (fingerprint) que parecem lançamentos já existentes na
 * mesma conta/cartão — lançados à mão, via Pluggy ou de outra importação.
 * Só sugere: quem decide é o usuário na revisão.
 */
async function findPossibleDuplicates(
	userId: string,
	destination: OfxImportDestination,
	rows: DuplicateCheckRow[],
	exactMatches: ImportMatch[],
): Promise<(PossibleDuplicate | null)[]> {
	const pendingIndexes = rows.flatMap((_, index) =>
		exactMatches[index]?.existingTransactionId ? [] : [index],
	);
	if (pendingIndexes.length === 0) return rows.map(() => null);

	const pendingRows = pendingIndexes.map(
		(index) => rows[index] as DuplicateCheckRow,
	);
	const dates = pendingRows.map((row) => parseLocalDateString(row.date));
	const sortedDates = pendingRows.map((row) => row.date).sort();
	const minDate = sortedDates[0] as string;
	const maxDate = sortedDates[sortedDates.length - 1] as string;
	const signedAmounts = [
		...new Set(
			pendingRows.map((row) =>
				formatDecimalForDbRequired(
					row.transactionType === "expense" ? -row.amount : row.amount,
				),
			),
		),
	];

	const destinationFilter =
		destination.type === "card"
			? eq(transactions.cardId, destination.id)
			: eq(transactions.accountId, destination.id);

	const candidates = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			purchaseDate: transactions.purchaseDate,
			transactionType: transactions.transactionType,
			installmentCount: transactions.installmentCount,
			currentInstallment: transactions.currentInstallment,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				destinationFilter,
				inArray(transactions.amount, signedAmounts),
				or(
					and(
						gte(
							transactions.purchaseDate,
							parseLocalDateString(
								addDays(minDate, -POSSIBLE_DUPLICATE_WINDOW_DAYS),
							),
						),
						lte(
							transactions.purchaseDate,
							parseLocalDateString(
								addDays(maxDate, POSSIBLE_DUPLICATE_WINDOW_DAYS),
							),
						),
					),
					// Parcelas mantêm a data da compra original.
					sql`${transactions.installmentCount} IS NOT NULL`,
				),
			),
		);

	// Lançamentos que já casaram exatamente com outra linha não contam.
	const consumed = new Set(
		exactMatches.flatMap((match) =>
			match.existingTransactionId ? [match.existingTransactionId] : [],
		),
	);
	const available = candidates
		.filter((candidate) => !consumed.has(candidate.id))
		.map((candidate) => ({
			id: candidate.id,
			name: candidate.name,
			amount: Number(candidate.amount),
			purchaseDate: candidate.purchaseDate,
			transactionType: candidate.transactionType,
			installmentCount: candidate.installmentCount,
			currentInstallment: candidate.currentInstallment,
		}));
	const byId = new Map(available.map((candidate) => [candidate.id, candidate]));

	const matches = matchLinesToTransactions(
		pendingRows.map((row, position) => ({
			description: row.description ?? row.sourceDescription,
			amount: row.amount,
			date: dates[position] as Date,
			transactionType: row.transactionType === "income" ? "Receita" : "Despesa",
			installment:
				row.installmentTotal && row.installmentCurrent
					? { current: row.installmentCurrent, total: row.installmentTotal }
					: null,
		})),
		available,
	);

	const result: (PossibleDuplicate | null)[] = rows.map(() => null);
	pendingIndexes.forEach((rowIndex, position) => {
		const match = matches[position];
		const candidate = match ? byId.get(match.transactionId) : null;
		if (!candidate) return;
		result[rowIndex] = {
			transactionId: candidate.id,
			name: candidate.name,
			purchaseDate: toDateOnlyString(candidate.purchaseDate) ?? "",
			amount: candidate.amount,
		};
	});

	return result;
}

export async function importTransactionsAction(
	input: ImportInput,
): Promise<ImportResult> {
	const userId = await getUserId();
	const parsed = importSchema.safeParse(input);

	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
		};
	}

	const {
		source,
		accountNumber,
		rows,
		payerId,
		accountId,
		cardId,
		paymentMethod,
		invoicePeriod,
	} = parsed.data;
	const destination: OfxImportDestination | null = cardId
		? { type: "card", id: cardId }
		: accountId
			? { type: "account", id: accountId }
			: null;

	if (!destination || (accountId && cardId)) {
		return { success: false, error: "Selecione uma conta ou cartão." };
	}

	const payerIdsByRow = rows.map((row) => row.payerId ?? payerId ?? null);

	if (payerIdsByRow.some((id) => !id)) {
		return { success: false, error: "Pessoa obrigatória." };
	}

	// Valida ownership
	const [ownedPayerIds, ownedCategoryIds, accountOk, cardOk] =
		await Promise.all([
			fetchOwnedPayerIds(userId, payerIdsByRow),
			fetchOwnedCategoryIds(
				userId,
				rows.map((row) => row.categoryId),
			),
			validateContaOwnership(userId, accountId),
			validateCartaoOwnership(userId, cardId),
		]);

	if (payerIdsByRow.some((id) => id && !ownedPayerIds.has(id))) {
		return { success: false, error: "Pessoa não encontrada." };
	}

	if (
		rows.some((row) => row.categoryId && !ownedCategoryIds.has(row.categoryId))
	) {
		return { success: false, error: "Categoria não encontrada." };
	}

	if (!accountOk) return { success: false, error: "Conta não encontrada." };
	if (!cardOk) return { success: false, error: "Cartão não encontrado." };

	const importMatches = await findExistingImports(
		userId,
		source,
		accountNumber,
		destination,
		rows,
	);
	const rowsToImport = rows.flatMap((row, index) => {
		const match = importMatches[index];
		return match?.existingTransactionId
			? []
			: [
					{
						row,
						payerId: payerIdsByRow[index],
						fingerprint: match?.fingerprint ?? null,
					},
				];
	});

	if (rowsToImport.length === 0) {
		return {
			success: true,
			imported: 0,
			skipped: rows.length,
			importBatchId: "",
		};
	}

	const importBatchId = crypto.randomUUID();

	// Cartão de crédito: fatura pode ainda não ter sido paga
	const isSettled = paymentMethod !== "Cartão de crédito";

	const entries = rowsToImport.map(({ row, payerId, fingerprint }) => {
		const purchaseDate = parseLocalDateString(row.date);
		const period =
			invoicePeriod ??
			`${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, "0")}`;
		const installmentTotal = row.installmentCount ?? null;
		const firstInstallment = installmentTotal
			? (row.currentInstallment ?? 1)
			: null;
		const seriesId = installmentTotal ? crypto.randomUUID() : null;

		const base = {
			name: row.description,
			transactionType: row.transactionType === "income" ? "Receita" : "Despesa",
			condition: installmentTotal
				? ("Parcelado" as const)
				: ("À vista" as const),
			paymentMethod,
			amount: (row.transactionType === "expense"
				? -row.amount
				: row.amount
			).toFixed(2),
			purchaseDate,
			userId,
			payerId,
			accountId: accountId ?? null,
			cardId: cardId ?? null,
			categoryId: row.categoryId ?? null,
			importBatchId,
			seriesId,
			installmentCount: installmentTotal,
		};

		const primary = {
			...base,
			period,
			isSettled,
			currentInstallment: firstInstallment,
			ofxFitId: row.externalId,
			ofxImportFingerprint: fingerprint,
		};

		// Parcelas seguintes (sem identidade OFX, que pertence à linha importada).
		const followUps =
			installmentTotal && firstInstallment
				? Array.from(
						{ length: installmentTotal - firstInstallment },
						(_, offset) => ({
							...base,
							period: addMonthsToPeriod(period, offset + 1),
							isSettled: isSettled === null ? null : false,
							currentInstallment: firstInstallment + offset + 1,
							ofxFitId: null,
							ofxImportFingerprint: null,
						}),
					)
				: [];

		return { primary, followUps };
	});

	// O índice de fingerprint protege contra importações concorrentes do mesmo OFX.
	const inserted = await db.transaction(async (tx: typeof db) => {
		const insertedPrimaries = await tx
			.insert(transactions)
			.values(entries.map((entry) => entry.primary))
			.onConflictDoNothing({
				target: [transactions.userId, transactions.ofxImportFingerprint],
				where: sql`ofx_import_fingerprint IS NOT NULL`,
			})
			.returning({
				id: transactions.id,
				fingerprint: transactions.ofxImportFingerprint,
			});

		// Só cria as parcelas seguintes de linhas que realmente entraram.
		const insertedFingerprints = new Set(
			insertedPrimaries.flatMap((row) =>
				row.fingerprint ? [row.fingerprint] : [],
			),
		);
		const followUps = entries
			.filter(
				(entry) =>
					!entry.primary.ofxImportFingerprint ||
					insertedFingerprints.has(entry.primary.ofxImportFingerprint),
			)
			.flatMap((entry) => entry.followUps);

		if (followUps.length > 0) {
			await tx.insert(transactions).values(followUps);
		}

		return insertedPrimaries;
	});

	await revalidateForEntity("transactions", userId);

	return {
		success: true,
		imported: inserted.length,
		skipped: rows.length - inserted.length,
		importBatchId,
	};
}

export async function deleteImportedTransaction(
	transactionId: string,
): Promise<{ success: boolean; error?: string }> {
	const parsedId = uuidSchema("Lançamento").safeParse(transactionId);
	if (!parsedId.success) {
		return { success: false, error: "Lançamento inválido." };
	}

	const userId = await getUserId();

	const deleted = await db
		.delete(transactions)
		.where(
			and(eq(transactions.userId, userId), eq(transactions.id, parsedId.data)),
		)
		.returning({ id: transactions.id });

	if (deleted.length === 0) {
		return { success: false, error: "Lançamento não encontrado." };
	}

	await revalidateForEntity("transactions", userId);

	return { success: true };
}

export async function undoImportAction(
	importBatchId: string,
): Promise<{ success: boolean; error?: string }> {
	if (!importBatchId) return { success: false, error: "Batch inválido." };

	const userId = await getUserId();

	await db
		.delete(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.importBatchId, importBatchId),
			),
		);

	await revalidateForEntity("transactions", userId);

	return { success: true };
}
