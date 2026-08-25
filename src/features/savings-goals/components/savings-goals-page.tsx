"use client";

import { RiAddFill, RiFlag2Line } from "@remixicon/react";
import { useState } from "react";
import { toast } from "sonner";
import { deleteSavingsGoalAction } from "@/features/savings-goals/actions";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { SavingsGoalCard } from "./savings-goal-card";
import { SavingsGoalDialog } from "./savings-goal-dialog";
import type { SavingsGoal, SavingsGoalAccount } from "./types";

interface SavingsGoalsPageProps {
	goals: SavingsGoal[];
	accounts: SavingsGoalAccount[];
}

export function SavingsGoalsPage({ goals, accounts }: SavingsGoalsPageProps) {
	const [editOpen, setEditOpen] = useState(false);
	const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
	const [removeOpen, setRemoveOpen] = useState(false);
	const [goalToRemove, setGoalToRemove] = useState<SavingsGoal | null>(null);

	const hasGoals = goals.length > 0;

	const handleEdit = (goal: SavingsGoal) => {
		setSelectedGoal(goal);
		setEditOpen(true);
	};

	const handleEditOpenChange = (open: boolean) => {
		setEditOpen(open);
		if (!open) {
			setSelectedGoal(null);
		}
	};

	const handleRemoveRequest = (goal: SavingsGoal) => {
		setGoalToRemove(goal);
		setRemoveOpen(true);
	};

	const handleRemoveOpenChange = (open: boolean) => {
		setRemoveOpen(open);
		if (!open) {
			setGoalToRemove(null);
		}
	};

	const handleRemoveConfirm = async () => {
		if (!goalToRemove) {
			return;
		}

		const result = await deleteSavingsGoalAction({ id: goalToRemove.id });

		if (result.success) {
			toast.success(result.message);
			return;
		}

		toast.error(result.error);
		throw new Error(result.error);
	};

	const removeTitle = goalToRemove
		? `Remover meta "${goalToRemove.description}"?`
		: "Remover meta?";

	const emptyDescription =
		accounts.length === 0
			? "Cadastre uma conta financeira para começar a definir metas."
			: "Crie sua primeira meta para acompanhar o progresso de uma conta.";

	return (
		<>
			<div className="flex w-full flex-col gap-6">
				<div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
					<SavingsGoalDialog
						mode="create"
						accounts={accounts}
						trigger={
							<Button
								disabled={accounts.length === 0}
								className="w-full sm:w-auto"
							>
								<RiAddFill className="size-4" />
								Nova meta
							</Button>
						}
					/>
				</div>

				{hasGoals ? (
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{goals.map((goal) => (
							<SavingsGoalCard
								key={goal.id}
								goal={goal}
								onEdit={handleEdit}
								onRemove={handleRemoveRequest}
							/>
						))}
					</div>
				) : (
					<Card className="flex min-h-[50vh] w-full items-center justify-center py-12">
						<EmptyState
							media={<RiFlag2Line className="size-6 text-primary" />}
							title="Nenhuma meta cadastrada"
							description={emptyDescription}
						/>
					</Card>
				)}
			</div>

			<SavingsGoalDialog
				mode="update"
				goal={selectedGoal ?? undefined}
				accounts={accounts}
				open={editOpen && !!selectedGoal}
				onOpenChange={handleEditOpenChange}
			/>

			<ConfirmActionDialog
				open={removeOpen && !!goalToRemove}
				onOpenChange={handleRemoveOpenChange}
				title={removeTitle}
				description="Esta ação remove a meta selecionada. As contas e lançamentos não são afetados."
				confirmLabel="Remover"
				pendingLabel="Removendo..."
				confirmVariant="destructive"
				onConfirm={handleRemoveConfirm}
			/>
		</>
	);
}
