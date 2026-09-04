import { DailyBudgetStatusBadge } from "@/features/daily-budget/components/daily-budget-status-badge";
import type { DailyBudgetOverview } from "@/features/daily-budget/queries";
import MoneyValues from "@/shared/components/money-values";
import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/ui";

type DailyBudgetHeroProps = {
	overview: DailyBudgetOverview;
};

export function DailyBudgetHero({ overview }: DailyBudgetHeroProps) {
	const {
		dailyBudget,
		spentToday,
		fixedSpentToday,
		budgetStatus,
		incomeWarning,
		projection,
	} = overview;
	const isOverToday = dailyBudget.remainingToday < 0;
	const currentMonth = projection.months[0];
	const remainingThisMonth =
		currentMonth?.days[currentMonth.days.length - 1]?.remainingBudget ?? 0;

	return (
		<Card className="flex flex-col gap-6 p-6">
			<div>
				<p className="text-sm text-muted-foreground">Hoje você pode gastar</p>
				<MoneyValues
					amount={dailyBudget.dailyBudgetAmount}
					className="text-4xl font-bold tabular-nums"
				/>
				{dailyBudget.isDeficit && (
					<p className="mt-1 text-sm font-medium text-destructive">
						Orçamento do mês já estourou — ajuste seus gastos ou o orçamento
						planejado.
					</p>
				)}
				{dailyBudget.personalizedLimitRisksNegativeBalance && (
					<p className="mt-1 text-sm font-medium text-warning">
						Nesse ritmo, seu limite personalizado ultrapassa o orçamento do mês
						antes do fim.
					</p>
				)}
				{incomeWarning.isOverIncome && (
					<p className="mt-1 text-sm font-medium text-warning">
						Seu orçamento planejado é{" "}
						<MoneyValues
							amount={incomeWarning.difference}
							className="inline text-sm font-medium"
						/>{" "}
						maior que a renda prevista pro mês.
					</p>
				)}
			</div>

			<div className="grid grid-cols-2 gap-4 border-t pt-4">
				<div>
					<p className="text-xs text-muted-foreground">Você gastou hoje</p>
					<MoneyValues amount={spentToday} className="text-lg font-semibold" />
					{fixedSpentToday > 0 && (
						<p className="mt-1 text-xs text-muted-foreground">
							<MoneyValues
								amount={fixedSpentToday}
								className="inline text-xs"
							/>{" "}
							em contas fixas já descontadas do orçamento do mês — não conta pro
							limite diário.
						</p>
					)}
				</div>
				<div>
					<p className="text-xs text-muted-foreground">Ainda disponível hoje</p>
					<MoneyValues
						amount={
							isOverToday
								? Math.abs(dailyBudget.remainingToday)
								: dailyBudget.remainingToday
						}
						className={cn(
							"text-lg font-semibold",
							isOverToday ? "text-destructive" : "text-success",
						)}
					/>
				</div>
			</div>

			<div className="flex items-center justify-between gap-4 border-t pt-4">
				<div>
					<p className="text-xs text-muted-foreground">
						Orçamento restante do mês
					</p>
					<MoneyValues
						amount={remainingThisMonth}
						className="text-lg font-semibold"
					/>
				</div>
				{budgetStatus ? (
					<DailyBudgetStatusBadge status={budgetStatus.statusColor} />
				) : (
					<p className="text-xs text-muted-foreground">
						Crie um orçamento pra ver o status
					</p>
				)}
			</div>
		</Card>
	);
}
