/**
 * `fetchDashboardAccounts` mudou pra `src/shared/lib/accounts/balance-queries.ts`
 * — virou contrato cruzado por dashboard, daily-budget, savings-goals,
 * bank-sync, diary, reports, mcp e balances. Este arquivo só reexporta pra
 * não quebrar nenhum import existente (`@/features/dashboard/lib/accounts-queries`).
 */
export {
	type DashboardAccount,
	type DashboardAccountsSnapshot,
	fetchDashboardAccounts,
} from "@/shared/lib/accounts/balance-queries";
