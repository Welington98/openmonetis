"use client";

import { useState } from "react";
import type { LoanInstallmentRow, LoanSummary } from "@/features/loans/queries";
import type { LoanDirection } from "@/shared/lib/loans/constants";
import { LoanAmortizationTable } from "./loan-amortization-table";
import { LoanSetupForm } from "./loan-setup-form";

type PaymentAccountOption = { id: string; name: string };

type LoanManagementProps = {
	accountId: string;
	accountName: string;
	direction: LoanDirection;
	loan: LoanSummary;
	schedule: LoanInstallmentRow[];
	paymentAccountOptions: PaymentAccountOption[];
};

export function LoanManagement({
	accountId,
	accountName,
	direction,
	loan,
	schedule,
	paymentAccountOptions,
}: LoanManagementProps) {
	const [isEditing, setIsEditing] = useState(false);
	const settledRows = schedule.filter((row) => row.isSettled);
	const settledCount = settledRows.length;
	const lastSettledNumber = settledRows.reduce(
		(max, row) => Math.max(max, row.installmentNumber),
		0,
	);
	const nextInstallmentNumber =
		settledCount > 0 ? lastSettledNumber + 1 : loan.startingInstallmentNumber;
	const lastSettledRow = settledRows.find(
		(row) => row.installmentNumber === lastSettledNumber,
	);
	const suggestedRemainingPrincipal =
		lastSettledRow?.remainingBalanceAfter ?? loan.principalAmount;
	const suggestedRemainingCount = Math.max(
		1,
		loan.installmentCount - settledCount,
	);

	if (isEditing) {
		return (
			<LoanSetupForm
				accountId={accountId}
				accountName={accountName}
				direction={direction}
				paymentAccountOptions={paymentAccountOptions}
				loan={loan}
				settledCount={settledCount}
				nextInstallmentNumber={nextInstallmentNumber}
				suggestedRemainingPrincipal={suggestedRemainingPrincipal}
				suggestedRemainingCount={suggestedRemainingCount}
				onCancel={() => setIsEditing(false)}
			/>
		);
	}

	return (
		<LoanAmortizationTable
			loan={loan}
			schedule={schedule}
			onEdit={() => setIsEditing(true)}
		/>
	);
}
