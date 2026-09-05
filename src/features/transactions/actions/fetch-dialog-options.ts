"use server";

import {
	buildOptionSets,
	buildSluggedFilters,
} from "@/features/transactions/lib/page-helpers";
import {
	fetchRecentEstablishments,
	fetchTransactionFilterSources,
} from "@/features/transactions/queries";
import { getUserId } from "@/shared/lib/auth/server";
import {
	buildCostCenterOptions,
	fetchOrSeedCostCentersForUser,
} from "@/shared/lib/cost-centers/queries";
import type { SelectOption } from "../components/types";

export type TransactionDialogOptions = {
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
	estabelecimentos: string[];
};

export async function fetchTransactionDialogOptionsAction(): Promise<TransactionDialogOptions> {
	const userId = await getUserId();

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

	const costCenterOptions: SelectOption[] = buildCostCenterOptions(costCenters);

	return {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
		costCenterOptions,
		estabelecimentos,
	};
}
