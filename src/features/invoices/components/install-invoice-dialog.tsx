"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { installInvoiceAction } from "@/features/invoices/actions";
import { generateAmortizationSchedule } from "@/features/loans/lib/amortization";
import { Button } from "@/shared/components/ui/button";
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
import { formatCurrency, normalizeDecimalInput } from "@/shared/utils/currency";

type InstallInvoiceDialogProps = {
	trigger: React.ReactNode;
	cardId: string;
	period: string;
	remainingAmount: number;
};

export function InstallInvoiceDialog({
	trigger,
	cardId,
	period,
	remainingAmount,
}: InstallInvoiceDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [installmentCount, setInstallmentCount] = useState("2");
	const [monthlyRate, setMonthlyRate] = useState("");

	const remainingAbs = Math.abs(remainingAmount);
	const count = Number(installmentCount);
	const rate = Number(normalizeDecimalInput(monthlyRate || "0"));

	const schedule = useMemo(() => {
		if (!Number.isFinite(count) || count < 2 || !Number.isFinite(rate)) {
			return [];
		}
		return generateAmortizationSchedule({
			principalCents: Math.round(remainingAbs * 100),
			monthlyRatePercent: rate,
			installmentCount: count,
			system: "price",
		});
	}, [remainingAbs, rate, count]);

	const handleConfirm = () => {
		if (!Number.isInteger(count) || count < 2 || count > 24) {
			toast.error("Informe um número de parcelas entre 2 e 24.");
			return;
		}
		if (!Number.isFinite(rate) || rate < 0) {
			toast.error("Informe uma taxa de juros válida.");
			return;
		}

		startTransition(async () => {
			const result = await installInvoiceAction({
				cardId,
				period,
				installmentCount: count,
				monthlyRatePercent: rate,
			});

			if (result.success) {
				toast.success(result.message);
				setOpen(false);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Parcelar fatura</DialogTitle>
					<DialogDescription>
						Divide o saldo em aberto em parcelas fixas com juros, seguindo a
						mesma tabela Price usada em empréstimos. As parcelas entram como
						lançamentos nas próximas faturas deste cartão.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
						<p className="text-muted-foreground">Saldo em aberto a parcelar</p>
						<p className="font-medium text-foreground">
							{formatCurrency(remainingAbs)}
						</p>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="install-count">Número de parcelas</Label>
							<Input
								id="install-count"
								type="number"
								min={2}
								max={24}
								value={installmentCount}
								onChange={(event) => setInstallmentCount(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="install-rate">Taxa de juros mensal (%)</Label>
							<Input
								id="install-rate"
								type="text"
								inputMode="decimal"
								placeholder="Ex.: 12,90"
								value={monthlyRate}
								onChange={(event) => setMonthlyRate(event.target.value)}
							/>
						</div>
					</div>

					{schedule.length > 0 ? (
						<div className="max-h-56 overflow-y-auto rounded-md border">
							<table className="w-full text-sm">
								<thead className="bg-muted/50 text-xs text-muted-foreground">
									<tr>
										<th className="px-3 py-2 text-left">Parcela</th>
										<th className="px-3 py-2 text-right">Principal</th>
										<th className="px-3 py-2 text-right">Juros</th>
										<th className="px-3 py-2 text-right">Total</th>
									</tr>
								</thead>
								<tbody>
									{schedule.map((installment) => (
										<tr
											key={installment.installmentNumber}
											className="border-t"
										>
											<td className="px-3 py-1.5">
												{installment.installmentNumber}/{count}
											</td>
											<td className="px-3 py-1.5 text-right">
												{formatCurrency(installment.principalAmountCents / 100)}
											</td>
											<td className="px-3 py-1.5 text-right">
												{formatCurrency(installment.interestAmountCents / 100)}
											</td>
											<td className="px-3 py-1.5 text-right font-medium">
												{formatCurrency(installment.totalAmountCents / 100)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={handleConfirm}
						disabled={isPending || schedule.length === 0}
					>
						{isPending ? "Parcelando..." : "Parcelar fatura"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
