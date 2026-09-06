import {
	RiCalendarCheckLine,
	RiCoinLine,
	RiLineChartLine,
	RiSafeLine,
	RiScales3Line,
	RiWalletLine,
} from "@remixicon/react";
import type { DailyBudgetOverview } from "@/features/daily-budget/queries";
import MoneyValues from "@/shared/components/money-values";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatPercentage } from "@/shared/utils/percentage";
import { cn } from "@/shared/utils/ui";

type DailyBudgetStatCardsProps = {
	overview: DailyBudgetOverview;
};

function lifeCostLabel(pct: number | null): {
	label: string;
	className: string;
} {
	if (pct === null)
		return { label: "Sem dados de renda", className: "text-muted-foreground" };
	if (pct <= 70) return { label: "Dentro da renda", className: "text-success" };
	if (pct <= 100)
		return { label: "Próximo do limite", className: "text-warning" };
	return { label: "Acima da renda", className: "text-destructive" };
}

export function DailyBudgetStatCards({ overview }: DailyBudgetStatCardsProps) {
	const {
		dailyBudget,
		averageSpending,
		accumulatedSavings,
		movements,
		projection,
	} = overview;

	const currentMonth = projection.months[0];
	const remainingThisMonth =
		currentMonth?.days[currentMonth.days.length - 1]?.remainingBudget ?? 0;

	const income = movements.income;
	const savedAmount = Math.max(income - movements.expenses, 0);
	const savedPct = income > 0 ? (savedAmount / income) * 100 : null;
	const lifeCostPct = income > 0 ? (movements.expenses / income) * 100 : null;
	const lifeCost = lifeCostLabel(lifeCostPct);

	const cards = [
		{
			label: "Pode gastar hoje",
			icon: RiWalletLine,
			iconClass: "text-primary",
			value: (
				<MoneyValues
					amount={dailyBudget.dailyBudgetAmount}
					className="text-xl font-semibold"
				/>
			),
		},
		{
			label: "Média diária gasta",
			icon: RiLineChartLine,
			iconClass: "text-cyan-600",
			value: (
				<MoneyValues
					amount={averageSpending.averageDailySpending}
					className="text-xl font-semibold"
				/>
			),
		},
		{
			label: "Ritmo acumulado",
			icon: RiCoinLine,
			iconClass:
				accumulatedSavings.accumulatedSavings >= 0
					? "text-success"
					: "text-destructive",
			value: (
				<div className="flex flex-col gap-0.5">
					<MoneyValues
						amount={Math.abs(accumulatedSavings.accumulatedSavings)}
						className={cn(
							"text-xl font-semibold",
							accumulatedSavings.accumulatedSavings >= 0
								? "text-success"
								: "text-destructive",
						)}
					/>
					<span className="text-xs text-muted-foreground">
						{accumulatedSavings.accumulatedSavings >= 0
							? "economizado no ritmo até hoje"
							: "acima do ritmo até hoje"}
					</span>
				</div>
			),
		},
		{
			label: "Orçamento restante do mês",
			icon: RiCalendarCheckLine,
			iconClass: remainingThisMonth >= 0 ? "text-success" : "text-destructive",
			value: (
				<MoneyValues
					amount={remainingThisMonth}
					className={cn(
						"text-xl font-semibold",
						remainingThisMonth >= 0 ? "text-success" : "text-destructive",
					)}
				/>
			),
		},
		{
			label: "Economizado",
			icon: RiSafeLine,
			iconClass: "text-success",
			value: (
				<div className="flex items-baseline gap-2">
					<MoneyValues amount={savedAmount} className="text-xl font-semibold" />
					{savedPct !== null && (
						<span className="text-xs text-muted-foreground">
							{formatPercentage(savedPct, { maximumFractionDigits: 0 })} da
							renda
						</span>
					)}
				</div>
			),
		},
		{
			label: "Custo de vida",
			icon: RiScales3Line,
			iconClass: lifeCost.className,
			value: (
				<div className="flex flex-col gap-0.5">
					<span className={cn("text-xl font-semibold", lifeCost.className)}>
						{lifeCostPct !== null
							? formatPercentage(lifeCostPct, { maximumFractionDigits: 0 })
							: "—"}
					</span>
					<span className={cn("text-xs", lifeCost.className)}>
						{lifeCost.label}
					</span>
				</div>
			),
		},
	];

	return (
		<div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @4xl/main:grid-cols-3">
			{cards.map(({ label, icon: Icon, iconClass, value }) => (
				<Card key={label} className="gap-2 py-5">
					<CardHeader className="gap-1">
						<CardTitle className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
							<Icon className={cn("size-4", iconClass)} aria-hidden />
							{label}
						</CardTitle>
					</CardHeader>
					<CardContent>{value}</CardContent>
				</Card>
			))}
		</div>
	);
}
