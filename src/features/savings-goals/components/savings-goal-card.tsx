"use client";

import {
	RiCheckboxCircleFill,
	RiDeleteBin5Line,
	RiPencilLine,
} from "@remixicon/react";
import MoneyValues from "@/shared/components/money-values";
import { Card, CardContent, CardFooter } from "@/shared/components/ui/card";
import { Progress } from "@/shared/components/ui/progress";
import { formatDateOnlyLabel } from "@/shared/utils/date";
import type { SavingsGoal } from "./types";

interface SavingsGoalCardProps {
	goal: SavingsGoal;
	onEdit: (goal: SavingsGoal) => void;
	onRemove: (goal: SavingsGoal) => void;
}

export function SavingsGoalCard({
	goal,
	onEdit,
	onRemove,
}: SavingsGoalCardProps) {
	const {
		description,
		targetAmount,
		currentBalance,
		progress,
		percent,
		isReached,
		suggestedMonthlyContribution,
		destinationAccount,
		targetDate,
	} = goal;

	return (
		<Card className="flex w-full flex-col p-6">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<h3 className="truncate font-semibold text-foreground">
						{description}
					</h3>
					<span className="text-xs text-muted-foreground">
						{destinationAccount?.name ?? "Conta removida"} · até{" "}
						{formatDateOnlyLabel(targetDate)}
					</span>
				</div>
				{isReached ? (
					<RiCheckboxCircleFill
						className="size-5 shrink-0 text-success"
						aria-label="Meta atingida"
					/>
				) : null}
			</div>

			<CardContent className="flex flex-1 flex-col gap-4 p-0">
				<div className="grid grid-cols-2 gap-2">
					<div className="flex flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">Acumulado</span>
						<MoneyValues
							amount={progress}
							className="text-xl font-semibold text-foreground"
						/>
					</div>
					<div className="flex flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">Meta</span>
						<MoneyValues
							amount={targetAmount}
							className="text-sm font-semibold text-primary"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Progress
						value={percent}
						className="h-2.5"
						aria-label={`${percent.toFixed(1)}% da meta atingida`}
					/>
					<span className="text-xs text-muted-foreground">
						{percent.toFixed(1)}% acumulado
					</span>
				</div>

				<div className="flex flex-col gap-0.5 border-t pt-3">
					<span className="text-xs text-muted-foreground">Saldo atual</span>
					<MoneyValues
						amount={currentBalance}
						className="text-sm font-medium text-foreground"
					/>
				</div>

				{!isReached && suggestedMonthlyContribution !== null ? (
					<div className="flex flex-col gap-0.5">
						<span className="text-xs text-muted-foreground">
							Sugestão de aporte mensal
						</span>
						<MoneyValues
							amount={suggestedMonthlyContribution}
							className="text-sm font-medium text-foreground"
						/>
					</div>
				) : null}
			</CardContent>

			<CardFooter className="mt-auto flex flex-wrap gap-4 px-0 pt-2 text-sm">
				<button
					type="button"
					onClick={() => onEdit(goal)}
					className="flex items-center gap-1 font-medium text-primary transition-opacity hover:opacity-80"
				>
					<RiPencilLine className="size-4" aria-hidden /> editar
				</button>
				<button
					type="button"
					onClick={() => onRemove(goal)}
					className="flex items-center gap-1 font-medium text-destructive transition-opacity hover:opacity-80"
				>
					<RiDeleteBin5Line className="size-4" aria-hidden /> remover
				</button>
			</CardFooter>
		</Card>
	);
}
