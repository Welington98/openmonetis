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
	const hasSettledInstallments = schedule.some((row) => row.isSettled);

	if (isEditing) {
		return (
			<LoanSetupForm
				accountId={accountId}
				accountName={accountName}
				direction={direction}
				paymentAccountOptions={paymentAccountOptions}
				loan={loan}
				onCancel={() => setIsEditing(false)}
			/>
		);
	}

	return (
		<LoanAmortizationTable
			loan={loan}
			schedule={schedule}
			hasSettledInstallments={hasSettledInstallments}
			onEdit={() => setIsEditing(true)}
		/>
	);
}
