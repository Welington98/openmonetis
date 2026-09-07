export const LOAN_ACCOUNT_TYPE_CONTRATADO = "Empréstimo Contratado";
export const LOAN_ACCOUNT_TYPE_CONCEDIDO = "Empréstimo Concedido";

export const LOAN_ACCOUNT_TYPES = [
	LOAN_ACCOUNT_TYPE_CONTRATADO,
	LOAN_ACCOUNT_TYPE_CONCEDIDO,
] as const;

export type LoanDirection = "contratado" | "concedido";

export function isLoanAccountType(accountType: string): boolean {
	return (LOAN_ACCOUNT_TYPES as readonly string[]).includes(accountType);
}

export function resolveLoanDirection(
	accountType: string,
): LoanDirection | null {
	if (accountType === LOAN_ACCOUNT_TYPE_CONTRATADO) return "contratado";
	if (accountType === LOAN_ACCOUNT_TYPE_CONCEDIDO) return "concedido";
	return null;
}

export const LOAN_CATEGORY_NAME = "Empréstimos";

export const LOAN_DISBURSEMENT_NOTE_PREFIX = "AUTO_EMPRESTIMO_DESEMBOLSO:";

export const LOAN_INSTALLMENT_NOTE_PREFIX = "AUTO_EMPRESTIMO_PARCELA:";
