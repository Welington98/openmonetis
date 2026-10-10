import { toDateOnlyString } from "@/shared/utils/date";
import type { StatementLineWithCategory } from "../queries";

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 60;

/**
 * Classificação de uma linha de extrato feita na tela e ainda não importada.
 * Vive só no navegador até o usuário clicar em "Importar classificados".
 * `amount` é o valor de UMA parcela (igual ao do extrato).
 */
export type LineDraft = {
	transactionType: "Despesa" | "Receita";
	amount: number;
	name: string;
	purchaseDate: string;
	accountId: string | null;
	cardId: string | null;
	categoryId: string;
	costCenterId: string | null;
	payerId: string | null;
	paymentMethod: string;
	condition: "À vista" | "Parcelado";
	installmentCount?: number;
	startInstallment?: number;
};

// Bancos costumam sufixar a descrição com "02/04" (parcela atual/total).
export function detectInstallments(description: string) {
	const match = description.match(/(\d{1,2})\/(\d{1,2})\s*$/);
	if (!match) return null;
	const current = Number(match[1]);
	const total = Number(match[2]);
	if (
		total < MIN_INSTALLMENTS ||
		total > MAX_INSTALLMENTS ||
		current < 1 ||
		current > total
	) {
		return null;
	}
	return { current, total };
}

/** Indica se o rascunho tem tudo que a importação exige. */
export function isDraftComplete(
	line: Pick<StatementLineWithCategory, "pluggyAccountType">,
	draft: LineDraft,
) {
	const isCardLine = line.pluggyAccountType === "CREDIT";
	return (
		!!(isCardLine ? draft.cardId : draft.accountId) &&
		!!draft.categoryId &&
		(draft.transactionType !== "Despesa" || !!draft.costCenterId) &&
		!!draft.purchaseDate &&
		!!draft.name.trim() &&
		draft.amount > 0
	);
}

export type BulkOverrides = {
	categoryId: string | null;
	costCenterId: string | null;
	accountId: string | null;
	cardId: string | null;
	payerId: string | null;
	paymentMethod: string | null;
};

/**
 * Aplica valores em lote por cima do rascunho existente (ou de um rascunho
 * novo montado dos padrões da linha). Campos `null`/`undefined` em `overrides`
 * mantêm o valor atual. Devolve `null` se ainda faltar dado obrigatório.
 */
export function applyBulkOverrides(
	line: StatementLineWithCategory,
	existing: LineDraft | undefined,
	defaultPayerId: string | null,
	overrides: BulkOverrides,
): LineDraft | null {
	const isCardLine = line.pluggyAccountType === "CREDIT";
	const detected = detectInstallments(line.description);
	const transactionType =
		existing?.transactionType ??
		(line.type === "receita" ? "Receita" : "Despesa");

	const base: Omit<LineDraft, "categoryId"> & { categoryId: string | null } =
		existing ?? {
			transactionType,
			amount: Math.abs(Number(line.amount)),
			name: line.description,
			purchaseDate: toDateOnlyString(line.date) ?? "",
			accountId: isCardLine ? null : line.linkedFinancialAccountId,
			cardId: isCardLine ? line.linkedCardId : null,
			categoryId: line.categoryId,
			costCenterId: null,
			payerId: defaultPayerId,
			paymentMethod: isCardLine ? "Cartão de crédito" : "Pix",
			condition: detected ? "Parcelado" : "À vista",
			installmentCount: detected?.total,
			startInstallment: detected?.current,
		};

	const categoryId = overrides.categoryId ?? base.categoryId;
	if (!categoryId) return null;

	const draft: LineDraft = {
		...base,
		categoryId,
		costCenterId:
			transactionType === "Despesa"
				? (overrides.costCenterId ?? base.costCenterId)
				: null,
		accountId: isCardLine ? null : (overrides.accountId ?? base.accountId),
		cardId: isCardLine ? (overrides.cardId ?? base.cardId) : null,
		payerId: overrides.payerId ?? base.payerId,
		paymentMethod: isCardLine
			? "Cartão de crédito"
			: (overrides.paymentMethod ?? base.paymentMethod),
	};

	return isDraftComplete(line, draft) ? draft : null;
}
