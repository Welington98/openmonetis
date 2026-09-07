import { and, asc, eq } from "drizzle-orm";
import { loanInstallments, loans } from "@/db/schema";
import type { AmortizationSystem } from "@/features/loans/lib/amortization";
import { db } from "@/shared/lib/db";
import type { LoanDirection } from "@/shared/lib/loans/constants";
import { toDateOnlyString } from "@/shared/utils/date";
import { safeToNumber as toNumber } from "@/shared/utils/number";

export type LoanSummary = {
	id: string;
	accountId: string;
	direction: LoanDirection;
	principalAmount: number;
	interestRateMonthly: number;
	installmentCount: number;
	amortizationSystem: AmortizationSystem;
	firstDueDate: string;
	paymentAccountId: string;
	paymentAccountName: string | null;
};

export async function fetchLoanByAccountId(
	userId: string,
	accountId: string,
): Promise<LoanSummary | null> {
	const loan = await db.query.loans.findFirst({
		where: and(eq(loans.accountId, accountId), eq(loans.userId, userId)),
		with: {
			paymentAccount: { columns: { name: true } },
		},
	});

	if (!loan) return null;

	return {
		id: loan.id,
		accountId: loan.accountId,
		direction: loan.direction as LoanDirection,
		principalAmount: toNumber(loan.principalAmount),
		interestRateMonthly: toNumber(loan.interestRateMonthly),
		installmentCount: loan.installmentCount,
		amortizationSystem: loan.amortizationSystem as AmortizationSystem,
		firstDueDate: toDateOnlyString(loan.firstDueDate) ?? "",
		paymentAccountId: loan.paymentAccountId,
		paymentAccountName: loan.paymentAccount?.name ?? null,
	};
}

export type LoanInstallmentRow = {
	installmentNumber: number;
	dueDate: string;
	totalAmount: number;
	principalAmount: number;
	interestAmount: number;
	remainingBalanceAfter: number;
	isSettled: boolean;
};

export async function fetchLoanAmortizationSchedule(
	loanId: string,
): Promise<LoanInstallmentRow[]> {
	const rows = await db.query.loanInstallments.findMany({
		where: eq(loanInstallments.loanId, loanId),
		orderBy: asc(loanInstallments.installmentNumber),
		with: {
			transaction: {
				columns: { amount: true, isSettled: true },
			},
		},
	});

	return rows.map((row) => ({
		installmentNumber: row.installmentNumber,
		dueDate: toDateOnlyString(row.dueDate) ?? "",
		totalAmount: Math.abs(toNumber(row.transaction?.amount)),
		principalAmount: toNumber(row.principalAmount),
		interestAmount: toNumber(row.interestAmount),
		remainingBalanceAfter: toNumber(row.remainingBalanceAfter),
		isSettled: row.transaction?.isSettled ?? false,
	}));
}
