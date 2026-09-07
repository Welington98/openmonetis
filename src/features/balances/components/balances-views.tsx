"use client";

import { BalancesHorizonGrid } from "@/features/balances/components/balances-horizon-grid";
import { BalancesTable } from "@/features/balances/components/balances-table";
import type { BalanceProjectionOverview } from "@/features/balances/queries";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";

export function BalancesViews({
	overview,
}: {
	overview: BalanceProjectionOverview;
}) {
	return (
		<Tabs defaultValue="detalhado">
			<TabsList>
				<TabsTrigger value="detalhado">Detalhado</TabsTrigger>
				<TabsTrigger value="horizonte">Horizonte</TabsTrigger>
			</TabsList>
			<TabsContent value="detalhado" className="pt-4">
				<BalancesTable overview={overview} />
			</TabsContent>
			<TabsContent value="horizonte" className="pt-4">
				<BalancesHorizonGrid overview={overview} />
			</TabsContent>
		</Tabs>
	);
}
