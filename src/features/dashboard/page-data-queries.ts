import { cacheLife, cacheTag } from "next/cache";
import { fetchDashboardData } from "@/features/dashboard/fetch-dashboard-data";
import { fetchUserDashboardPreferences } from "@/features/dashboard/lib/preferences-queries";
import {
	buildOptionSets,
	buildSluggedFilters,
} from "@/features/transactions/lib/page-helpers";
import {
	fetchRecentEstablishments,
	fetchTransactionFilterSources,
} from "@/features/transactions/queries";
import {
	buildCostCenterOptions,
	fetchOrSeedCostCentersForUser,
} from "@/shared/lib/cost-centers/queries";

type DashboardQuickActionOptions = {
	payerOptions: ReturnType<typeof buildOptionSets>["payerOptions"];
	splitPayerOptions: ReturnType<typeof buildOptionSets>["splitPayerOptions"];
	defaultPayerId: string | null;
	accountOptions: ReturnType<typeof buildOptionSets>["accountOptions"];
	cardOptions: ReturnType<typeof buildOptionSets>["cardOptions"];
	categoryOptions: ReturnType<typeof buildOptionSets>["categoryOptions"];
	costCenterOptions: ReturnType<typeof buildCostCenterOptions>;
	estabelecimentos: string[];
};

async function fetchDashboardQuickActionOptionsInternal(
	userId: string,
): Promise<DashboardQuickActionOptions> {
	const [filterSources, estabelecimentos, costCenters] = await Promise.all([
		fetchTransactionFilterSources(userId),
		fetchRecentEstablishments(userId),
		fetchOrSeedCostCentersForUser(userId),
	]);

	const sluggedFilters = buildSluggedFilters(filterSources);
	const {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
	} = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	return {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
		costCenterOptions: buildCostCenterOptions(costCenters),
		estabelecimentos,
	};
}

async function fetchDashboardQuickActionOptions(userId: string) {
	"use cache";
	cacheTag(`dashboard-${userId}`);
	cacheLife({ revalidate: 3 });
	return fetchDashboardQuickActionOptionsInternal(userId);
}

export async function fetchDashboardPageData(userId: string, period: string) {
	const [dashboardData, preferences, quickActionOptions] = await Promise.all([
		fetchDashboardData(userId, period),
		fetchUserDashboardPreferences(userId),
		fetchDashboardQuickActionOptions(userId),
	]);

	return {
		dashboardData,
		preferences,
		quickActionOptions,
	};
}
