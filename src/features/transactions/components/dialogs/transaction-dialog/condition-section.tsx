"use client";

import {
	INDEFINITE_RECURRENCE_MONTHS,
	TRANSACTION_CONDITIONS,
} from "@/features/transactions/lib/constants";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";
import { ConditionSelectContent } from "../../select-items";
import type { ConditionSectionProps } from "./transaction-dialog-types";

export function ConditionSection({
	formState,
	onFieldChange,
	showInstallments,
	showRecurrence,
	isCreateMode,
}: ConditionSectionProps) {
	const parsedAmount = Number(formState.amount);
	const amount =
		Number.isNaN(parsedAmount) || parsedAmount <= 0 ? null : parsedAmount;

	const getInstallmentLabel = (count: number) => {
		if (amount) {
			const installmentValue = amount / count;
			return `${count}x de R$ ${formatCurrency(installmentValue)}`;
		}

		return `${count}x`;
	};

	const installmentCount = Number(formState.installmentCount);
	const hasInstallmentCount =
		showInstallments &&
		formState.installmentCount &&
		!Number.isNaN(installmentCount) &&
		installmentCount > 0;
	const installmentSummary = hasInstallmentCount
		? getInstallmentLabel(installmentCount)
		: null;

	return (
		<div className="flex w-full flex-col gap-2">
			<div className="flex w-full flex-col gap-2 md:flex-row">
				<div
					className={cn(
						"space-y-1 w-full",
						showInstallments || showRecurrence ? "md:w-1/2" : "md:w-full",
					)}
				>
					<Label htmlFor="condition">Condição</Label>
					<Select
						value={formState.condition}
						onValueChange={(value) => onFieldChange("condition", value)}
					>
						<SelectTrigger id="condition" className="w-full">
							<SelectValue placeholder="Selecione">
								{formState.condition && (
									<ConditionSelectContent label={formState.condition} />
								)}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{TRANSACTION_CONDITIONS.map((condition) => (
								<SelectItem key={condition} value={condition}>
									<ConditionSelectContent label={condition} />
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{showInstallments ? (
					<div className="space-y-1 w-full md:w-1/2">
						<Label htmlFor="installmentCount">Parcelado em</Label>
						<Select
							value={formState.installmentCount}
							onValueChange={(value) =>
								onFieldChange("installmentCount", value)
							}
						>
							<SelectTrigger id="installmentCount" className="w-full">
								<SelectValue placeholder="Selecione">
									{installmentSummary}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{[...Array(24)].map((_, index) => {
									const count = index + 2;
									return (
										<SelectItem key={count} value={String(count)}>
											{getInstallmentLabel(count)}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>
				) : null}

				{showRecurrence ? (
					<div className="space-y-1 w-full md:w-1/2">
						<Label htmlFor="recurrenceCount">Repetirá por</Label>
						<Select
							value={formState.recurrenceCount}
							onValueChange={(value) => onFieldChange("recurrenceCount", value)}
						>
							<SelectTrigger id="recurrenceCount" className="w-full">
								<SelectValue placeholder="Selecione">
									{formState.recurrenceCount ===
									String(INDEFINITE_RECURRENCE_MONTHS)
										? "Sem prazo definido (fixo)"
										: formState.recurrenceCount
											? `${formState.recurrenceCount} meses`
											: null}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={String(INDEFINITE_RECURRENCE_MONTHS)}>
									Sem prazo definido (fixo)
								</SelectItem>
								{[...Array(INDEFINITE_RECURRENCE_MONTHS - 2)].map(
									(_, index) => (
										<SelectItem key={index + 2} value={String(index + 2)}>
											{index + 2} meses
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
						{formState.recurrenceCount ===
						String(INDEFINITE_RECURRENCE_MONTHS) ? (
							<p className="text-muted-foreground text-xs">
								Repete todo mês por {INDEFINITE_RECURRENCE_MONTHS / 12} anos.
								Pra encerrar antes, apague as próximas ocorrências.
							</p>
						) : null}
					</div>
				) : null}
			</div>

			{showInstallments ? (
				<div className="flex w-full flex-col gap-2 md:flex-row">
					<div className="space-y-1 w-full md:w-1/3">
						<Label htmlFor="startInstallment">Parcela inicial</Label>
						<Input
							id="startInstallment"
							type="number"
							inputMode="numeric"
							min={1}
							max={hasInstallmentCount ? installmentCount : undefined}
							disabled={!hasInstallmentCount}
							value={formState.startInstallment}
							onChange={(event) =>
								onFieldChange("startInstallment", event.target.value)
							}
						/>
					</div>

					{isCreateMode ? (
						<div className="space-y-1 w-full md:w-1/3">
							<Label htmlFor="installmentInterval">Repete a cada (meses)</Label>
							<Input
								id="installmentInterval"
								type="number"
								inputMode="numeric"
								min={1}
								max={12}
								value={formState.installmentInterval}
								onChange={(event) =>
									onFieldChange("installmentInterval", event.target.value)
								}
							/>
						</div>
					) : null}

					{isCreateMode ? (
						<div className="space-y-1 w-full md:w-1/3">
							<div className="flex items-center gap-2">
								<Checkbox
									id="useManualInstallmentAmount"
									checked={formState.useManualInstallmentAmount}
									onCheckedChange={(checked) =>
										onFieldChange(
											"useManualInstallmentAmount",
											checked === true,
										)
									}
								/>
								<Label
									htmlFor="useManualInstallmentAmount"
									className="cursor-pointer font-normal"
								>
									Valor da parcela
								</Label>
							</div>
							<CurrencyInput
								id="manualInstallmentAmount"
								value={formState.manualInstallmentAmount}
								onValueChange={(value) =>
									onFieldChange("manualInstallmentAmount", value)
								}
								placeholder="R$ 0,00"
								disabled={!formState.useManualInstallmentAmount}
							/>
						</div>
					) : null}
				</div>
			) : null}

			{showRecurrence && isCreateMode ? (
				<div className="flex w-full flex-col gap-2 md:flex-row">
					<div className="space-y-1 w-full md:w-1/2">
						<Label htmlFor="recurrenceInterval">Repete a cada (meses)</Label>
						<Input
							id="recurrenceInterval"
							type="number"
							inputMode="numeric"
							min={1}
							max={12}
							value={formState.installmentInterval}
							onChange={(event) =>
								onFieldChange("installmentInterval", event.target.value)
							}
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}
