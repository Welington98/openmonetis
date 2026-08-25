import { compareDateOnly, getBusinessDateString } from "@/shared/utils/date";

export const TRANSACTION_STATUS_VALUES = {
	SCHEDULED: "agendado",
	PENDING: "pendente",
	CONFIRMED: "confirmado",
} as const;

export type TransactionStatus =
	(typeof TRANSACTION_STATUS_VALUES)[keyof typeof TRANSACTION_STATUS_VALUES];

export type TransactionStatusInput = {
	isSettled: boolean | null;
	purchaseDate: string | Date;
};

export function getTransactionStatus(
	transaction: TransactionStatusInput,
	referenceDate: string | Date = getBusinessDateString(),
): TransactionStatus {
	if (transaction.isSettled) {
		return TRANSACTION_STATUS_VALUES.CONFIRMED;
	}

	return compareDateOnly(transaction.purchaseDate, referenceDate) > 0
		? TRANSACTION_STATUS_VALUES.SCHEDULED
		: TRANSACTION_STATUS_VALUES.PENDING;
}

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
	[TRANSACTION_STATUS_VALUES.SCHEDULED]: "Agendado",
	[TRANSACTION_STATUS_VALUES.PENDING]: "Pendente",
	[TRANSACTION_STATUS_VALUES.CONFIRMED]: "Confirmado",
};

export const TRANSACTION_STATUS_BADGE_CLASSNAMES: Record<
	TransactionStatus,
	string
> = {
	[TRANSACTION_STATUS_VALUES.SCHEDULED]:
		"border-muted-foreground/30 bg-muted/20 text-muted-foreground dark:bg-transparent",
	[TRANSACTION_STATUS_VALUES.PENDING]:
		"border-info/30 bg-info/5 text-info dark:saturate-90 dark:border-info/50 dark:bg-transparent",
	[TRANSACTION_STATUS_VALUES.CONFIRMED]:
		"border-success/30 bg-success/5 text-success dark:saturate-90 dark:border-success/50 dark:bg-transparent",
};
