import {
	buildDateOnlyStringFromPeriodDay,
	compareDateOnly,
	formatDateOnlyLabel,
	getBusinessDateString,
	isDateOnlyPast,
	parseUtcDateString,
	toDateOnlyString,
} from "@/shared/utils/date";

type FinancialStatusLabelInput = {
	isSettled: boolean;
	dueDate: string | null;
	paidAt: string | null;
	paidPrefix?: string;
	duePrefix?: string;
};

type FinancialDueDateInfo = {
	label: string;
	date: string | null;
};

type RelativeFinancialDateContext = "due" | "paid" | "received";

export function formatFinancialDateLabel(
	value: string | null,
	prefix?: string,
	options?: Intl.DateTimeFormatOptions,
): string | null {
	return formatDateOnlyLabel(value, prefix, options);
}

function getOffsetDateString(
	referenceDate: string,
	offset: number,
): string | null {
	const parsedReference = parseUtcDateString(referenceDate);
	if (!parsedReference) {
		return null;
	}

	parsedReference.setUTCDate(parsedReference.getUTCDate() + offset);
	return toDateOnlyString(parsedReference);
}

export function formatRelativeFinancialDateLabel(
	value: string | null,
	context: RelativeFinancialDateContext,
	options?: {
		referenceDate?: string | Date | null;
	},
): string | null {
	const normalizedValue = toDateOnlyString(value);
	if (!normalizedValue) {
		return null;
	}

	const referenceDate =
		toDateOnlyString(options?.referenceDate) ?? getBusinessDateString();
	const yesterday = getOffsetDateString(referenceDate, -1);
	const tomorrow = getOffsetDateString(referenceDate, 1);

	if (context === "due") {
		if (normalizedValue === referenceDate) {
			return "Vence hoje";
		}

		if (normalizedValue === tomorrow) {
			return "Vence amanhã";
		}

		if (normalizedValue === yesterday) {
			return "Venceu ontem";
		}

		return formatFinancialDateLabel(normalizedValue, "Vence em");
	}

	const settlementLabel = context === "received" ? "Recebido" : "Pago";

	if (normalizedValue === referenceDate) {
		return `${settlementLabel} hoje`;
	}

	if (normalizedValue === yesterday) {
		return `${settlementLabel} ontem`;
	}

	return formatFinancialDateLabel(normalizedValue, `${settlementLabel} em`);
}

export function buildFinancialStatusLabel({
	isSettled,
	dueDate,
	paidAt,
	paidPrefix = "Pago em",
	duePrefix = "Vence em",
}: FinancialStatusLabelInput): string | null {
	if (isSettled) {
		return formatFinancialDateLabel(paidAt, paidPrefix);
	}

	return formatFinancialDateLabel(dueDate, duePrefix);
}

export function buildRelativeFinancialStatusLabel({
	isSettled,
	dueDate,
	paidAt,
}: FinancialStatusLabelInput): string | null {
	if (isSettled) {
		return formatRelativeFinancialDateLabel(paidAt, "paid");
	}

	return formatRelativeFinancialDateLabel(dueDate, "due");
}

export function buildDueDateInfoFromPeriodDay(
	period: string,
	dueDay: string,
	options?: {
		prefix?: string;
		fallbackPrefix?: string;
	},
): FinancialDueDateInfo {
	const prefix = options?.prefix ?? "Vence em";
	const fallbackPrefix = options?.fallbackPrefix ?? "Vence dia";
	const dueDate = buildDateOnlyStringFromPeriodDay(period, dueDay);

	if (!dueDate) {
		return {
			label: `${fallbackPrefix} ${dueDay}`,
			date: null,
		};
	}

	return {
		label:
			formatFinancialDateLabel(dueDate, prefix) ??
			`${fallbackPrefix} ${dueDay}`,
		date: dueDate,
	};
}

const compareDateOnlyAscWithNullsLast = (
	left: string | null,
	right: string | null,
): number => {
	if (!left && !right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	return compareDateOnly(left, right);
};

const compareDateOnlyDescWithNullsLast = (
	left: string | null,
	right: string | null,
): number => {
	if (!left && !right) return 0;
	if (!left) return 1;
	if (!right) return -1;
	return compareDateOnly(right, left);
};

/**
 * Ordena itens financeiros (contas/faturas) pendentes antes dos liquidados,
 * atrasados antes dos demais, depois por vencimento crescente e valor
 * decrescente; entre liquidados, pela data de liquidação mais recente.
 * Compartilhado entre o snapshot de boletos do dashboard, o snapshot de
 * faturas de cartão e a página de contas a pagar/receber para evitar 3
 * cópias do mesmo algoritmo.
 */
export type FinancialUrgencyAccessors<T> = {
	isSettled: (item: T) => boolean;
	dueDate: (item: T) => string | null;
	settledDate: (item: T) => string | null;
	amount: (item: T) => number;
	tieBreak: (a: T, b: T) => number;
};

export function compareFinancialUrgency<T>(
	a: T,
	b: T,
	accessors: FinancialUrgencyAccessors<T>,
	today: string = getBusinessDateString(),
): number {
	const aSettled = accessors.isSettled(a);
	const bSettled = accessors.isSettled(b);
	if (aSettled !== bSettled) {
		return aSettled ? 1 : -1;
	}

	if (!aSettled && !bSettled) {
		const aDue = accessors.dueDate(a);
		const bDue = accessors.dueDate(b);
		const aOverdue = aDue ? isDateOnlyPast(aDue, today) : false;
		const bOverdue = bDue ? isDateOnlyPast(bDue, today) : false;

		if (aOverdue !== bOverdue) {
			return aOverdue ? -1 : 1;
		}

		const dueDiff = compareDateOnlyAscWithNullsLast(aDue, bDue);
		if (dueDiff !== 0) {
			return dueDiff;
		}

		const amountDiff = accessors.amount(b) - accessors.amount(a);
		if (amountDiff !== 0) {
			return amountDiff;
		}
	}

	if (aSettled && bSettled) {
		const settledDiff = compareDateOnlyDescWithNullsLast(
			accessors.settledDate(a),
			accessors.settledDate(b),
		);
		if (settledDiff !== 0) {
			return settledDiff;
		}

		const amountDiff = accessors.amount(b) - accessors.amount(a);
		if (amountDiff !== 0) {
			return amountDiff;
		}
	}

	return accessors.tieBreak(a, b);
}

export function sortByFinancialUrgency<T>(
	items: T[],
	accessors: FinancialUrgencyAccessors<T>,
): T[] {
	const today = getBusinessDateString();
	return [...items].sort((a, b) =>
		compareFinancialUrgency(a, b, accessors, today),
	);
}

export function buildRelativeDueDateInfoFromPeriodDay(
	period: string,
	dueDay: string,
	options?: {
		fallbackPrefix?: string;
	},
): FinancialDueDateInfo {
	const fallbackPrefix = options?.fallbackPrefix ?? "Vence dia";
	const dueDate = buildDateOnlyStringFromPeriodDay(period, dueDay);

	if (!dueDate) {
		return {
			label: `${fallbackPrefix} ${dueDay}`,
			date: null,
		};
	}

	return {
		label:
			formatRelativeFinancialDateLabel(dueDate, "due") ??
			`${fallbackPrefix} ${dueDay}`,
		date: dueDate,
	};
}
