import type { DailyBudgetOverview } from "@/features/daily-budget/queries";
import MoneyValues from "@/shared/components/money-values";
import { Card } from "@/shared/components/ui/card";

type DailyBudgetMovementsSummaryProps = {
	overview: DailyBudgetOverview;
};

export function DailyBudgetMovementsSummary({
	overview,
}: DailyBudgetMovementsSummaryProps) {
	const { movements, averageSpending, targetSavings } = overview;
	const savedAmount = Math.max(movements.income - movements.expenses, 0);

	const items = [
		{ label: "Entradas", amount: movements.income, className: "text-success" },
		{
			label: "Saídas",
			amount: movements.expenses,
			className: "text-destructive",
		},
		{
			label: "Gastos diários (média)",
			amount: averageSpending.averageDailySpending,
			className: "text-foreground",
		},
		{
			label: "Economias",
			amount: Math.max(savedAmount, targetSavings),
			className: "text-success",
		},
		{
			label: "Gastos com cartão (hoje)",
			amount: movements.cardExpenses,
			className: "text-foreground",
		},
	];

	return (
		<Card className="p-5">
			<h3 className="mb-4 text-sm font-medium text-muted-foreground">
				Movimentações do mês
			</h3>
			<div className="grid grid-cols-2 gap-4 @2xl/main:grid-cols-5">
				{items.map((item) => (
					<div key={item.label} className="flex flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">{item.label}</span>
						<MoneyValues
							amount={item.amount}
							className={`text-sm font-semibold ${item.className}`}
						/>
					</div>
				))}
			</div>
		</Card>
	);
}
