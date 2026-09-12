"use client";

import { useQuery } from "@tanstack/react-query";
import type { TransactionItemListItem } from "@/features/transactions/lib/item-queries";
import { fetchJson } from "@/shared/utils/fetch-json";

export const transactionItemsQueryKey = (transactionId: string) =>
	["transactions", "items", transactionId] as const;

export function useTransactionItems(transactionId: string, enabled: boolean) {
	return useQuery({
		queryKey: transactionItemsQueryKey(transactionId),
		queryFn: () =>
			fetchJson<TransactionItemListItem[]>(
				`/api/transactions/${transactionId}/items`,
			),
		enabled: enabled && Boolean(transactionId),
	});
}
