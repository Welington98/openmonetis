"use client";

import type { DiaryDailyBudgetSummary } from "@/features/diary/queries";
import MoneyValues from "@/shared/components/money-values";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/ui";

type DiaryDailyBudgetCardProps = {
	info: DiaryDailyBudgetSummary;
};

export function DiaryDailyBudgetCard({ info }: DiaryDailyBudgetCardProps) {
	const { dailyBudgetAmount, spentToday, remainingToday } = info;
	const exceeded = remainingToday < 0;

	return (
		<Card className="flex flex-row items-center justify-between gap-4 p-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-xs text-muted-foreground">
					{exceeded ? "Excedido em" : "Disponível hoje"}
				</span>
				<MoneyValues
					amount={exceeded ? Math.abs(remainingToday) : remainingToday}
					className={cn(
						"text-xl font-semibold",
						exceeded ? "text-destructive" : "text-success",
					)}
				/>
			</div>

			<div className="flex flex-col items-end gap-0.5">
				<span className="text-xs text-muted-foreground">Orçamento de hoje</span>
				<MoneyValues
					amount={dailyBudgetAmount}
					className="text-sm font-semibold text-foreground"
				/>
				<span className="text-xs text-muted-foreground">
					Gasto: <MoneyValues amount={spentToday} className="text-xs" />
				</span>
			</div>
		</Card>
	);
}
