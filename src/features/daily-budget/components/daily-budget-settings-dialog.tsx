"use client";

import { RiAddLine, RiDeleteBinLine, RiSettings3Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	saveDailyBudgetSettingsAction,
	saveDailyForecastItemsAction,
} from "@/features/daily-budget/actions";
import { calculateDailyForecast } from "@/features/daily-budget/lib/forecast";
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
import { Input } from "@/shared/components/ui/input";
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
	forecastItems: Array<{ name: string; amount: number }>;
	daysInMonth: number;
};

type ForecastRow = { key: string; name: string; amount: string };

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export function DailyBudgetSettingsDialog({
	calculationMode: initialCalculationMode,
	customDailyLimit: initialCustomDailyLimit,
	targetSavings: initialTargetSavings,
	safetyBuffer: initialSafetyBuffer,
	forecastItems,
	daysInMonth,
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

	const [forecastRows, setForecastRows] = useState<ForecastRow[]>(() =>
		forecastItems.map((item, index) => ({
			key: `saved-${index}`,
			name: item.name,
			amount: String(item.amount),
		})),
	);

	const forecast = calculateDailyForecast(
		forecastRows.map((row) => ({ amount: Number(row.amount) || 0 })),
		daysInMonth,
	);

	const updateForecastRow = (key: string, patch: Partial<ForecastRow>) =>
		setForecastRows((rows) =>
			rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
		);

	const addForecastRow = () =>
		setForecastRows((rows) => [
			...rows,
			{ key: `new-${Date.now()}-${rows.length}`, name: "", amount: "" },
		]);

	const removeForecastRow = (key: string) =>
		setForecastRows((rows) => rows.filter((row) => row.key !== key));

	const useForecastAsLimit = () => {
		if (forecast.dailyAmount <= 0) return;
		setCalculationMode("personalizado");
		setCustomDailyLimit(forecast.dailyAmount.toFixed(2));
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		startTransition(async () => {
			const validForecastItems = forecastRows
				.map((row) => ({
					name: row.name.trim(),
					amount: Number(row.amount) || 0,
				}))
				.filter((row) => row.name !== "" && row.amount > 0);

			const forecastResult =
				await saveDailyForecastItemsAction(validForecastItems);
			if (!forecastResult.success) {
				toast.error(forecastResult.error);
				return;
			}

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
			<DialogContent className="max-h-[90vh] overflow-y-auto">
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

					<section className="space-y-3">
						<div>
							<Label className="text-sm">Previsão de diário</Label>
							<p className="text-sm text-muted-foreground">
								Liste os gastos variáveis que você espera ter no mês (mercado,
								combustível...). O total dividido pelos dias vira o limite
								diário.
							</p>
						</div>

						{forecastRows.map((row) => (
							<div key={row.key} className="flex items-center gap-2">
								<Input
									value={row.name}
									onChange={(event) =>
										updateForecastRow(row.key, { name: event.target.value })
									}
									placeholder="Ex.: Mercado"
									aria-label="Nome do gasto"
									maxLength={60}
									disabled={isPending}
								/>
								<CurrencyInput
									value={row.amount}
									onValueChange={(value) =>
										updateForecastRow(row.key, { amount: value })
									}
									placeholder="R$ 0,00"
									aria-label="Valor mensal"
									className="max-w-36"
									disabled={isPending}
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Remover gasto"
									onClick={() => removeForecastRow(row.key)}
									disabled={isPending}
								>
									<RiDeleteBinLine />
								</Button>
							</div>
						))}

						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addForecastRow}
							disabled={isPending || forecastRows.length >= 30}
						>
							<RiAddLine />
							Adicionar gasto
						</Button>

						<div className="rounded-md border p-3 text-sm space-y-1">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Total mensal</span>
								<span>{BRL.format(forecast.monthlyTotal)}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Dividido por</span>
								<span>{forecast.days} dias</span>
							</div>
							<div className="flex justify-between font-semibold">
								<span>Diário previsto</span>
								<span>{BRL.format(forecast.dailyAmount)}</span>
							</div>
						</div>

						<Button
							type="button"
							variant="secondary"
							size="sm"
							onClick={useForecastAsLimit}
							disabled={isPending || forecast.dailyAmount <= 0}
						>
							Usar como limite diário
						</Button>
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
