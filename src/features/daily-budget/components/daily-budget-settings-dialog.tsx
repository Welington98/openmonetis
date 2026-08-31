"use client";

import { RiSettings3Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveDailyBudgetSettingsAction } from "@/features/daily-budget/actions";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";

type DailyBudgetSettingsDialogProps = {
	calculationMode: "automatico" | "personalizado";
	customDailyLimit: number | null;
	targetSavings: number | null;
	safetyBuffer: number | null;
};

export function DailyBudgetSettingsDialog({
	calculationMode: initialCalculationMode,
	customDailyLimit: initialCustomDailyLimit,
	targetSavings: initialTargetSavings,
	safetyBuffer: initialSafetyBuffer,
}: DailyBudgetSettingsDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [calculationMode, setCalculationMode] = useState(
		initialCalculationMode,
	);
	const [customDailyLimit, setCustomDailyLimit] = useState(
		initialCustomDailyLimit !== null ? String(initialCustomDailyLimit) : "",
	);
	const [targetSavings, setTargetSavings] = useState(
		initialTargetSavings !== null ? String(initialTargetSavings) : "",
	);
	const [safetyBuffer, setSafetyBuffer] = useState(
		initialSafetyBuffer !== null ? String(initialSafetyBuffer) : "",
	);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		startTransition(async () => {
			const result = await saveDailyBudgetSettingsAction({
				calculationMode,
				customDailyLimit,
				targetSavings,
				safetyBuffer,
			});

			if (result.success) {
				toast.success(result.message);
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					aria-label="Configurar orçamento diário"
				>
					<RiSettings3Line />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Configurações do orçamento diário</DialogTitle>
					<DialogDescription>
						Defina como calcular quanto você pode gastar por dia.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="flex flex-col gap-6">
					<section className="space-y-2">
						<Label className="text-sm">Modo de cálculo</Label>
						<ToggleGroup
							type="single"
							variant="outline"
							value={calculationMode}
							onValueChange={(value) => {
								if (value) setCalculationMode(value as typeof calculationMode);
							}}
							className="flex flex-wrap justify-start gap-2"
						>
							<ToggleGroupItem value="automatico">Automático</ToggleGroupItem>
							<ToggleGroupItem value="personalizado">
								Personalizado
							</ToggleGroupItem>
						</ToggleGroup>
						<p className="text-sm text-muted-foreground">
							Automático divide o orçamento do mês (feature Orçamentos) pelos
							dias restantes. Personalizado usa um limite fixo por dia, definido
							abaixo.
						</p>
					</section>

					{calculationMode === "personalizado" && (
						<section className="space-y-2 max-w-xs">
							<Label htmlFor="daily-budget-custom-limit" className="text-sm">
								Limite diário
							</Label>
							<CurrencyInput
								id="daily-budget-custom-limit"
								value={customDailyLimit}
								onValueChange={setCustomDailyLimit}
								placeholder="R$ 0,00"
								disabled={isPending}
							/>
						</section>
					)}

					<section className="space-y-2 max-w-xs">
						<Label htmlFor="daily-budget-target-savings" className="text-sm">
							Meta de economia do mês (opcional)
						</Label>
						<CurrencyInput
							id="daily-budget-target-savings"
							value={targetSavings}
							onValueChange={setTargetSavings}
							placeholder="Sem meta"
							disabled={isPending}
						/>
					</section>

					<section className="space-y-2 max-w-xs">
						<Label htmlFor="daily-budget-safety-buffer" className="text-sm">
							Reserva de segurança (opcional)
						</Label>
						<CurrencyInput
							id="daily-budget-safety-buffer"
							value={safetyBuffer}
							onValueChange={setSafetyBuffer}
							placeholder="Sem reserva"
							disabled={isPending}
						/>
					</section>

					<DialogFooter>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar configurações"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
