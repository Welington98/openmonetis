import { connection } from "next/server";
import { DailyBudgetHero } from "@/features/daily-budget/components/daily-budget-hero";
import { DailyBudgetMovementsSummary } from "@/features/daily-budget/components/daily-budget-movements-summary";
import { DailyBudgetProjectionTable } from "@/features/daily-budget/components/daily-budget-projection-table";
import { DailyBudgetSettingsDialog } from "@/features/daily-budget/components/daily-budget-settings-dialog";
import { DailyBudgetStatCards } from "@/features/daily-budget/components/daily-budget-stat-cards";
import { fetchDailyBudgetOverview } from "@/features/daily-budget/queries";
import { getUserId } from "@/shared/lib/auth/server";
import { getBusinessDateString } from "@/shared/utils/date";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const overview = await fetchDailyBudgetOverview(userId);
	const today = getBusinessDateString();

	return (
		<main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold">Orçamento diário</h1>
					<p className="text-sm text-muted-foreground">
						Quanto você pode gastar hoje sem comprometer o resto do mês.
					</p>
				</div>
				<DailyBudgetSettingsDialog
					calculationMode={overview.calculationMode}
					customDailyLimit={overview.customDailyLimit}
					targetSavings={overview.targetSavings || null}
					safetyBuffer={overview.safetyBuffer || null}
				/>
			</div>

			<DailyBudgetHero overview={overview} />

			<DailyBudgetStatCards overview={overview} />

			<DailyBudgetMovementsSummary overview={overview} />

			<DailyBudgetProjectionTable
				projection={overview.projection}
				today={today}
			/>
		</main>
	);
}
