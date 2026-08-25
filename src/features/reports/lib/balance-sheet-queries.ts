import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import { isAccountInactive } from "@/shared/lib/accounts/constants";
import {
	type BalanceSheetAccount,
	type BalanceSheetTotals,
	classifyAccountType,
	computeBalanceSheetTotals,
} from "./balance-sheet-classification";

export type BalanceSheetReport = {
	totals: BalanceSheetTotals;
	ativoAccounts: BalanceSheetAccount[];
	passivoAccounts: BalanceSheetAccount[];
};

export async function fetchBalanceSheetReport(
	userId: string,
): Promise<BalanceSheetReport> {
	const { accounts } = await fetchDashboardAccounts(userId);

	const balanceSheetAccounts: BalanceSheetAccount[] = accounts
		.filter(
			(account) =>
				!account.excludeFromBalance && !isAccountInactive(account.status),
		)
		.map((account) => ({
			id: account.id,
			name: account.name,
			accountType: account.accountType,
			logo: account.logo,
			balance: account.balance,
			classification: classifyAccountType(account.accountType),
		}));

	const totals = computeBalanceSheetTotals(balanceSheetAccounts);

	return {
		totals,
		ativoAccounts: balanceSheetAccounts
			.filter((account) => account.classification === "ativo")
			.sort((a, b) => b.balance - a.balance),
		passivoAccounts: balanceSheetAccounts
			.filter((account) => account.classification === "passivo")
			.sort((a, b) => a.balance - b.balance),
	};
}
