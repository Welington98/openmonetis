import { formatDecimalForDbRequired } from "@/shared/utils/currency";

export type OfxImportDestination = {
	type: "account" | "card";
	id: string;
};

export type OfxIdentityRow = {
	externalId: string | null;
	externalIdOccurrence: number;
	date: string;
	amount: number;
	transactionType: "income" | "expense";
	sourceDescription: string;
};

type OfxIdentityInput = {
	source: string;
	accountNumber: string | null;
	destination: OfxImportDestination;
	row: OfxIdentityRow;
};

export function normalizeOfxIdentityText(value: string): string {
	return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildOfxOccurrenceKey(
	row: Omit<OfxIdentityRow, "externalIdOccurrence">,
): string | null {
	if (!row.externalId) return null;

	const signedAmount =
		row.transactionType === "expense" ? -row.amount : row.amount;

	return JSON.stringify([
		row.externalId.trim(),
		row.date,
		formatDecimalForDbRequired(signedAmount),
		row.transactionType,
		normalizeOfxIdentityText(row.sourceDescription),
	]);
}

/**
 * Chave de ocorrência para linhas SEM identificador do banco (planilha, PDF):
 * a identidade vem do conteúdo (data, valor, tipo, descrição original).
 */
export function buildContentOccurrenceKey(
	row: Omit<OfxIdentityRow, "externalIdOccurrence" | "externalId">,
): string {
	const signedAmount =
		row.transactionType === "expense" ? -row.amount : row.amount;

	return JSON.stringify([
		row.date,
		formatDecimalForDbRequired(signedAmount),
		row.transactionType,
		normalizeOfxIdentityText(row.sourceDescription),
	]);
}

/**
 * Numera linhas de conteúdo idêntico dentro do mesmo arquivo (0, 1, 2…), para
 * que duas compras iguais no mesmo dia tenham identidades distintas — e sigam
 * estáveis ao reimportar o mesmo arquivo.
 */
export function assignContentOccurrences<
	T extends Omit<OfxIdentityRow, "externalIdOccurrence">,
>(rows: T[]): (T & { externalIdOccurrence: number })[] {
	const counts = new Map<string, number>();

	return rows.map((row) => {
		if (row.externalId) return { ...row, externalIdOccurrence: 0 };

		const key = buildContentOccurrenceKey(row);
		const occurrence = counts.get(key) ?? 0;
		counts.set(key, occurrence + 1);
		return { ...row, externalIdOccurrence: occurrence };
	});
}

export function buildOfxFingerprintPayload({
	source,
	accountNumber,
	destination,
	row,
}: OfxIdentityInput): string | null {
	const signedAmount =
		row.transactionType === "expense" ? -row.amount : row.amount;

	if (!row.externalId) {
		return JSON.stringify([
			"openmonetis-import-content-v1",
			normalizeOfxIdentityText(source),
			normalizeOfxIdentityText(accountNumber ?? ""),
			destination.type,
			destination.id,
			row.date,
			formatDecimalForDbRequired(signedAmount),
			row.transactionType,
			normalizeOfxIdentityText(row.sourceDescription),
			row.externalIdOccurrence,
		]);
	}

	return JSON.stringify([
		"openmonetis-ofx-v1",
		normalizeOfxIdentityText(source),
		normalizeOfxIdentityText(accountNumber ?? ""),
		destination.type,
		destination.id,
		row.externalId.trim(),
		row.date,
		formatDecimalForDbRequired(signedAmount),
		row.transactionType,
		normalizeOfxIdentityText(row.sourceDescription),
		row.externalIdOccurrence,
	]);
}
