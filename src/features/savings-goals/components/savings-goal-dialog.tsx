"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createSavingsGoalAction,
	updateSavingsGoalAction,
} from "@/features/savings-goals/actions";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { useFormState } from "@/shared/hooks/use-form-state";
import {
	formatInitialBalanceInput,
	normalizeDecimalInput,
} from "@/shared/utils/currency";
import { getTodayDateString } from "@/shared/utils/date";
import type {
	SavingsGoal,
	SavingsGoalAccount,
	SavingsGoalFormValues,
} from "./types";

interface SavingsGoalDialogProps {
	mode: "create" | "update";
	trigger?: React.ReactNode;
	goal?: SavingsGoal;
	accounts: SavingsGoalAccount[];
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

const buildInitialValues = (goal?: SavingsGoal): SavingsGoalFormValues => ({
	description: goal?.description ?? "",
	targetAmount: formatInitialBalanceInput(goal?.targetAmount ?? 0),
	startDate: goal?.startDate ?? getTodayDateString(),
	targetDate: goal?.targetDate ?? "",
	destinationAccountId: goal?.destinationAccount?.id ?? "",
});

export function SavingsGoalDialog({
	mode,
	trigger,
	goal,
	accounts,
	open,
	onOpenChange,
}: SavingsGoalDialogProps) {
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const initialState = useMemo(() => buildInitialValues(goal), [goal]);

	const { formState, resetForm, updateField } =
		useFormState<SavingsGoalFormValues>(initialState);

	useEffect(() => {
		if (dialogOpen) {
			resetForm(initialState);
			setErrorMessage(null);
		}
	}, [dialogOpen, initialState, resetForm]);

	useEffect(() => {
		if (!dialogOpen) {
			setErrorMessage(null);
		}
	}, [dialogOpen]);

	const disabled = accounts.length === 0;

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (mode === "update" && !goal?.id) {
			const message = "Meta inválida.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (formState.description.trim().length === 0) {
			const message = "Informe uma descrição.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (formState.destinationAccountId.length === 0) {
			const message = "Selecione a conta de destino.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		if (!formState.startDate || !formState.targetDate) {
			const message = "Informe as datas de início e alvo.";
			setErrorMessage(message);
			toast.error(message);
			return;
		}

		const payload = {
			description: formState.description.trim(),
			targetAmount: normalizeDecimalInput(formState.targetAmount),
			startDate: formState.startDate,
			targetDate: formState.targetDate,
			destinationAccountId: formState.destinationAccountId,
		};

		startTransition(async () => {
			const result =
				mode === "create"
					? await createSavingsGoalAction(payload)
					: await updateSavingsGoalAction({ id: goal?.id ?? "", ...payload });

			if (result.success) {
				toast.success(result.message);
				setDialogOpen(false);
				resetForm(initialState);
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		});
	};

	const title = mode === "create" ? "Nova meta" : "Atualizar meta";
	const description =
		mode === "create"
			? "Defina um objetivo de acúmulo para uma das suas contas."
			: "Atualize os detalhes da meta selecionada.";
	const submitLabel = mode === "create" ? "Salvar" : "Atualizar";

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{disabled ? (
					<div className="space-y-4">
						<div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
							Cadastre pelo menos uma conta financeira para criar uma meta.
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setDialogOpen(false)}
							>
								Fechar
							</Button>
						</DialogFooter>
					</div>
				) : (
					<form className="space-y-4" onSubmit={handleSubmit}>
						<div className="space-y-2">
							<Label htmlFor="goal-description">Descrição</Label>
							<Input
								id="goal-description"
								value={formState.description}
								onChange={(event) =>
									updateField("description", event.target.value)
								}
								placeholder="Ex: Viagem de fim de ano"
								maxLength={120}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="goal-account">Conta de destino</Label>
							<Select
								value={formState.destinationAccountId}
								onValueChange={(value) =>
									updateField("destinationAccountId", value)
								}
							>
								<SelectTrigger id="goal-account" className="w-full">
									<SelectValue placeholder="Selecione uma conta" />
								</SelectTrigger>
								<SelectContent>
									{accounts.map((account) => (
										<SelectItem key={account.id} value={account.id}>
											{account.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="goal-target-amount">Valor alvo</Label>
							<CurrencyInput
								id="goal-target-amount"
								value={formState.targetAmount}
								onValueChange={(value) => updateField("targetAmount", value)}
								placeholder="R$ 0,00"
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="space-y-2">
								<Label htmlFor="goal-start-date">Data de início</Label>
								<DatePicker
									id="goal-start-date"
									value={formState.startDate}
									onChange={(value) => updateField("startDate", value)}
									compact
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="goal-target-date">Data alvo</Label>
								<DatePicker
									id="goal-target-date"
									value={formState.targetDate}
									onChange={(value) => updateField("targetDate", value)}
									compact
								/>
							</div>
						</div>

						{errorMessage ? (
							<p className="text-sm font-medium text-destructive">
								{errorMessage}
							</p>
						) : null}

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setDialogOpen(false)}
								disabled={isPending}
							>
								Cancelar
							</Button>
							<Button type="submit" disabled={isPending}>
								{isPending ? "Salvando..." : submitLabel}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
