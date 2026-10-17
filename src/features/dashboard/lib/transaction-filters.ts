import { eq, ilike, isNull, ne, not, or } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import {
	INITIAL_BALANCE_NOTE,
	REFUND_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";
import { excludeInvoiceSettlementEntries } from "@/shared/lib/accounts/query-filters";

export { excludeTransactionsFromExcludedAccounts } from "@/shared/lib/accounts/query-filters";

type DashboardAdminFiltersParams = {
	userId: string;
	adminPayerId: string;
};

export const buildDashboardAdminFilters = ({
	userId,
	adminPayerId,
}: DashboardAdminFiltersParams) =>
	[
		eq(transactions.userId, userId),
		eq(transactions.payerId, adminPayerId),
	] as const;

export const excludeAutoInvoiceEntries = excludeInvoiceSettlementEntries;

export const excludeRefundEntries = () =>
	or(
		isNull(transactions.note),
		not(ilike(transactions.note, `${REFUND_NOTE_PREFIX}%`)),
	);

export const excludeInitialBalanceWhenConfigured = () =>
	or(
		isNull(transactions.note),
		ne(transactions.note, INITIAL_BALANCE_NOTE),
		isNull(financialAccounts.excludeInitialBalanceFromIncome),
		eq(financialAccounts.excludeInitialBalanceFromIncome, false),
	);
