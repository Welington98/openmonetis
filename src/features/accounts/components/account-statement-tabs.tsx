"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { TRANSACTION_STATUS_VALUES } from "@/features/transactions/lib/transaction-status";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

const STATEMENT_TABS = [
	{ value: TRANSACTION_STATUS_VALUES.PENDING, label: "Pendentes" },
	{ value: TRANSACTION_STATUS_VALUES.SCHEDULED, label: "Agendados" },
	{ value: TRANSACTION_STATUS_VALUES.CONFIRMED, label: "Confirmados" },
	{ value: TRANSACTION_STATUS_VALUES.RECONCILED, label: "Conciliados" },
] as const;

export function AccountStatementTabs({
	activeStatus,
}: {
	activeStatus: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [, startTransition] = useTransition();

	const handleChange = useCallback(
		(value: string) => {
			const nextParams = new URLSearchParams(searchParams.toString());
			nextParams.set("status", value);
			nextParams.delete("page");

			startTransition(() => {
				router.replace(`${pathname}?${nextParams.toString()}`, {
					scroll: false,
				});
			});
		},
		[searchParams, pathname, router],
	);

	return (
		<Tabs value={activeStatus} onValueChange={handleChange}>
			<TabsList variant="stacked" className="grid-cols-4">
				{STATEMENT_TABS.map((tab) => (
					<TabsTrigger key={tab.value} value={tab.value}>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}
