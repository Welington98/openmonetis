"use client";

import { useState } from "react";
import type { MultiMonthProjectionResult } from "@/features/daily-budget/lib/daily-projection";
import MoneyValues from "@/shared/components/money-values";
import NavigationButton from "@/shared/components/month-picker/nav-button";
import { Card } from "@/shared/components/ui/card";
import { formatDateOnlyLabel } from "@/shared/utils/date";
import { formatMonthYearLabel } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type DailyBudgetProjectionTableProps = {
	projection: MultiMonthProjectionResult;
	today: string;
};

export function DailyBudgetProjectionTable({
	projection,
	today,
}: DailyBudgetProjectionTableProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const month = projection.months[selectedIndex];

	if (!month) return null;

	return (
		<Card className="p-5">
			<div className="mb-4 flex items-center justify-between gap-2">
				<h3 className="text-sm font-medium text-muted-foreground">
					Projeção diária
				</h3>
				<div className="flex items-center gap-1">
					<NavigationButton
						direction="left"
						disabled={selectedIndex === 0}
						onClick={() => setSelectedIndex((index) => index - 1)}
					/>
					<span className="min-w-28 text-center text-sm font-medium capitalize">
						{formatMonthYearLabel(month.period)}
					</span>
					<NavigationButton
						direction="right"
						disabled={selectedIndex === projection.months.length - 1}
						onClick={() => setSelectedIndex((index) => index + 1)}
					/>
				</div>
			</div>

			{month.isEstimated && (
				<p className="mb-3 text-xs text-muted-foreground">
					Você ainda não criou orçamento pra esse mês — os valores abaixo são
					uma estimativa baseada no orçamento do mês atual.
				</p>
			)}

			<div className="overflow-x-auto">
				<table className="w-full min-w-[520px] text-sm">
					<thead>
						<tr className="border-b text-left text-xs text-muted-foreground">
							<th className="py-2 pr-3 font-normal">Dia</th>
							<th className="py-2 pr-3 font-normal">Entradas</th>
							<th className="py-2 pr-3 font-normal">Gastos</th>
							<th className="py-2 pr-3 font-normal">Orçamento diário</th>
							<th className="py-2 pr-3 font-normal">Orçamento restante</th>
						</tr>
					</thead>
					<tbody>
						{month.days.map((day) => {
							const isToday = day.date === today;
							return (
								<tr
									key={day.date}
									className={cn(
										"border-b last:border-0",
										isToday && "bg-primary/5 font-medium",
									)}
								>
									<td className="py-2 pr-3 whitespace-nowrap">
										{formatDateOnlyLabel(day.date)}
										{isToday && (
											<span className="ml-2 text-xs text-primary">hoje</span>
										)}
									</td>
									<td className="py-2 pr-3">
										<MoneyValues amount={day.income} className="text-success" />
									</td>
									<td className="py-2 pr-3">
										<MoneyValues
											amount={day.expenses}
											className="text-destructive"
										/>
									</td>
									<td className="py-2 pr-3">
										<MoneyValues amount={day.dailyBudget} />
									</td>
									<td className="py-2 pr-3">
										<MoneyValues
											amount={day.remainingBudget}
											className={
												day.remainingBudget < 0 ? "text-destructive" : undefined
											}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</Card>
	);
}
