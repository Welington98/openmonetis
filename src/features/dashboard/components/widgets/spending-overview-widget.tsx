"use client";

import { RiArrowUpDoubleLine, RiStore2Line } from "@remixicon/react";
import { useState } from "react";
import type { TopExpensesData } from "@/features/dashboard/expenses/top-expenses-queries";
import type { TopEstablishmentsData } from "@/features/dashboard/lib/top-establishments-queries";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { TopEstablishmentsWidget } from "./top-establishments-widget";
import { TopExpensesWidget } from "./top-expenses-widget";

type SpendingOverviewWidgetProps = {
	topExpensesAll: TopExpensesData;
	topEstablishmentsData: TopEstablishmentsData;
};

export function SpendingOverviewWidget({
	topExpensesAll,
	topEstablishmentsData,
}: SpendingOverviewWidgetProps) {
	const [activeTab, setActiveTab] = useState<"expenses" | "establishments">(
		"expenses",
	);

	return (
		<Tabs
			value={activeTab}
			onValueChange={(value) =>
				setActiveTab(value as "expenses" | "establishments")
			}
			className="w-full"
		>
			<TabsList className="grid grid-cols-2">
				<TabsTrigger
					value="expenses"
					className="min-w-0 text-xs data-[state=active]:bg-transparent"
				>
					<RiArrowUpDoubleLine className="mr-1 size-3.5 shrink-0" />
					<span className="truncate">Top gastos</span>
				</TabsTrigger>
				<TabsTrigger
					value="establishments"
					className="min-w-0 text-xs data-[state=active]:bg-transparent"
				>
					<RiStore2Line className="mr-1 size-3.5 shrink-0" />
					<span className="truncate">Estabelecimentos</span>
				</TabsTrigger>
			</TabsList>

			<TabsContent value="expenses" className="mt-2">
				<TopExpensesWidget data={topExpensesAll} />
			</TabsContent>

			<TabsContent value="establishments" className="mt-2">
				<TopEstablishmentsWidget data={topEstablishmentsData} />
			</TabsContent>
		</Tabs>
	);
}
