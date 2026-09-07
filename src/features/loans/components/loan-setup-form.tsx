"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createLoanAction } from "@/features/loans/actions";
import type { AmortizationSystem } from "@/features/loans/lib/amortization";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
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
import type { LoanDirection } from "@/shared/lib/loans/constants";
import { normalizeDecimalInput } from "@/shared/utils/currency";
import { getTodayDateString } from "@/shared/utils/date";

type PaymentAccountOption = { id: string; name: string };

type LoanSetupFormProps = {
	accountId: string;
	accountName: string;
	direction: LoanDirection;
	paymentAccountOptions: PaymentAccountOption[];
};

export function LoanSetupForm({
	accountId,
	accountName,
	direction,
	paymentAccountOptions,
}: LoanSetupFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [principalAmount, setPrincipalAmount] = useState("");
	const [interestRateMonthly, setInterestRateMonthly] = useState("");
	const [installmentCount, setInstallmentCount] = useState("12");
	const [amortizationSystem, setAmortizationSystem] =
		useState<AmortizationSystem>("price");
	const [firstDueDate, setFirstDueDate] = useState(getTodayDateString());
	const [paymentAccountId, setPaymentAccountId] = useState(
		paymentAccountOptions[0]?.id ?? "",
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const helperText =
		direction === "contratado"
			? `Quanto você tomou emprestado e vai pagar em parcelas, saindo da conta escolhida abaixo.`
			: `Quanto você emprestou a alguém e vai receber em parcelas, entrando na conta escolhida abaixo.`;

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (!paymentAccountId) {
			setErrorMessage(
				direction === "contratado"
					? "Selecione a conta de onde as parcelas vão sair."
					: "Selecione a conta onde as parcelas vão entrar.",
			);
			return;
		}

		startTransition(async () => {
			const result = await createLoanAction({
				accountId,
				paymentAccountId,
				principalAmount: normalizeDecimalInput(principalAmount),
				interestRateMonthly: normalizeDecimalInput(interestRateMonthly),
				installmentCount,
				amortizationSystem,
				firstDueDate,
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		});
	};

	return (
		<Card className="p-6">
			<div className="mb-4 flex flex-col gap-1">
				<h2 className="text-lg font-semibold">Configurar empréstimo</h2>
				<p className="text-sm text-muted-foreground">{helperText}</p>
			</div>

			<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="loan-principal">Valor principal</Label>
						<CurrencyInput
							id="loan-principal"
							value={principalAmount}
							onValueChange={setPrincipalAmount}
							placeholder="R$ 0,00"
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="loan-rate">Taxa de juros mensal (%)</Label>
						<Input
							id="loan-rate"
							type="text"
							inputMode="decimal"
							value={interestRateMonthly}
							onChange={(event) => setInterestRateMonthly(event.target.value)}
							placeholder="Ex.: 1,99"
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="loan-installments">Número de parcelas</Label>
						<Input
							id="loan-installments"
							type="number"
							min={1}
							max={420}
							value={installmentCount}
							onChange={(event) => setInstallmentCount(event.target.value)}
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="loan-system">Sistema de amortização</Label>
						<Select
							value={amortizationSystem}
							onValueChange={(value) =>
								setAmortizationSystem(value as AmortizationSystem)
							}
						>
							<SelectTrigger id="loan-system" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="price">Price (parcela fixa)</SelectItem>
								<SelectItem value="sac">SAC (parcela decrescente)</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="loan-first-due-date">Primeiro vencimento</Label>
						<Input
							id="loan-first-due-date"
							type="date"
							value={firstDueDate}
							onChange={(event) => setFirstDueDate(event.target.value)}
							required
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="loan-payment-account">
							{direction === "contratado"
								? "Conta de pagamento"
								: "Conta de recebimento"}
						</Label>
						<Select
							value={paymentAccountId}
							onValueChange={setPaymentAccountId}
						>
							<SelectTrigger id="loan-payment-account" className="w-full">
								<SelectValue placeholder="Selecione a conta" />
							</SelectTrigger>
							<SelectContent>
								{paymentAccountOptions.map((option) => (
									<SelectItem key={option.id} value={option.id}>
										{option.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				{errorMessage && (
					<p className="text-sm text-destructive">{errorMessage}</p>
				)}

				<div className="flex justify-end">
					<Button type="submit" disabled={isPending}>
						{isPending
							? "Salvando..."
							: `Configurar empréstimo de ${accountName}`}
					</Button>
				</div>
			</form>
		</Card>
	);
}
