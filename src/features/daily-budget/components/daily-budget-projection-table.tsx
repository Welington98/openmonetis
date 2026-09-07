"use client";

import { useState } from "react";
import type {
	DailyProjectionRow,
	MultiMonthProjectionResult,
} from "@/features/daily-budget/lib/daily-projection";
import MoneyValues from "@/shared/components/money-values";
import NavigationButton from "@/shared/components/month-picker/nav-button";
import { Card } from "@/shared/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { getBalanceCellTone } from "@/shared/lib/balance-tone";
import { formatDateOnlyLabel } from "@/shared/utils/date";
import { formatMonthYearLabel } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type DailyBudgetProjectionTableProps = {
	projection: MultiMonthProjectionResult;
	today: string;
	/** Cota diária de referência do mês atual — usada só pra achar o limiar de "orçamento ficando baixo" (× 7 dias), igual a `/balances`. */
	dailyBudgetAmount: number;
};

type BucketKey = "income" | "expenses" | "dailyBudget";

const BUCKET_LABEL: Record<BucketKey, string> = {
	income: "Entradas",
	expenses: "Gastos",
	dailyBudget: "Orçamento diário",
};

const BUCKET_TONE: Record<BucketKey, string | undefined> = {
	income: "text-success",
	expenses: "text-destructive",
	dailyBudget: undefined,
};

function bucketValue(day: DailyProjectionRow, bucket: BucketKey): number {
	switch (bucket) {
		case "income":
			return day.income;
		case "expenses":
			return day.expenses;
		default:
			return day.dailyBudget;
	}
}

export function DailyBudgetProjectionTable({
	projection,
	today,
	dailyBudgetAmount,
}: DailyBudgetProjectionTableProps) {
	// Mesma heurística de "uma semana de cota" que a projeção de saldo usa
	// pra separar verde de amarelo — mantém as duas abas com o mesmo critério.
	const warningThreshold = dailyBudgetAmount * 7;
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [bucket, setBucket] = useState<BucketKey>("expenses");
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

			{/* Mobile: Dia + balde selecionável + Orçamento restante */}
			<div className="md:hidden">
				<Select
					value={bucket}
					onValueChange={(value) => setBucket(value as BucketKey)}
				>
					<SelectTrigger className="mb-3 w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(Object.keys(BUCKET_LABEL) as BucketKey[]).map((key) => (
							<SelectItem key={key} value={key}>
								{BUCKET_LABEL[key]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<table className="w-full text-sm">
					<thead>
						<tr className="border-b text-left text-xs text-muted-foreground">
							<th className="py-2 pr-3 font-normal">Dia</th>
							<th className="py-2 pr-3 font-normal">{BUCKET_LABEL[bucket]}</th>
							<th className="py-2 pr-3 font-normal">Orçamento restante</th>
						</tr>
					</thead>
					<tbody>
						{month.days.map((day) => {
							const isToday = day.date === today;
							const tone = getBalanceCellTone(
								day.remainingBudget,
								warningThreshold,
							);
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
										<MoneyValues
											amount={bucketValue(day, bucket)}
											className={BUCKET_TONE[bucket]}
										/>
									</td>
									<td
										className={cn(
											"py-2 pr-3 pl-2 transition-colors",
											tone.background,
										)}
									>
										<MoneyValues
											amount={day.remainingBudget}
											className={cn("font-semibold", tone.text)}
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{/* Desktop: as 5 colunas de uma vez */}
			<div className="hidden overflow-x-auto md:block">
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
							const tone = getBalanceCellTone(
								day.remainingBudget,
								warningThreshold,
							);
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
									<td
										className={cn(
											"py-2 pr-3 pl-2 transition-colors",
											tone.background,
										)}
									>
										<MoneyValues
											amount={day.remainingBudget}
											className={cn("font-semibold", tone.text)}
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
