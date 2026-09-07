import { notFound } from "next/navigation";
import { fetchAccountData } from "@/features/accounts/statement-queries";
import { LoanAmortizationTable } from "@/features/loans/components/loan-amortization-table";
import { LoanSetupForm } from "@/features/loans/components/loan-setup-form";
import {
	fetchLoanAmortizationSchedule,
	fetchLoanByAccountId,
} from "@/features/loans/queries";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	isLoanAccountType,
	resolveLoanDirection,
} from "@/shared/lib/loans/constants";

type PageProps = {
	params: Promise<{ accountId: string }>;
};

export default async function LoanPage({ params }: PageProps) {
	const { accountId } = await params;
	const userId = await getUserId();

	const account = await fetchAccountData(userId, accountId);
	if (!account || !isLoanAccountType(account.accountType)) {
		notFound();
	}

	const direction = resolveLoanDirection(account.accountType);
	if (!direction) {
		notFound();
	}

	const loan = await fetchLoanByAccountId(userId, accountId);

	return (
		<div className="flex w-full flex-col gap-6">
			<div>
				<h1 className="text-xl font-semibold">{account.name}</h1>
				<p className="text-sm text-muted-foreground">{account.accountType}</p>
			</div>

			{loan ? (
				<LoanAmortizationTable
					loan={loan}
					schedule={await fetchLoanAmortizationSchedule(loan.id)}
				/>
			) : (
				<LoanSetupForm
					accountId={accountId}
					accountName={account.name}
					direction={direction}
					paymentAccountOptions={await fetchPaymentAccountOptions(userId)}
				/>
			)}
		</div>
	);
}

async function fetchPaymentAccountOptions(userId: string) {
	const rows = await db.query.financialAccounts.findMany({
		columns: { id: true, name: true, accountType: true },
		where: (accounts, { eq }) => eq(accounts.userId, userId),
	});

	return rows
		.filter((row) => !isLoanAccountType(row.accountType))
		.map((row) => ({ id: row.id, name: row.name }));
}
