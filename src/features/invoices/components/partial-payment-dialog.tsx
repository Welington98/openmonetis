"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { payInvoicePartiallyAction } from "@/features/invoices/actions";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
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
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";

type PaymentAccountOption = {
	value: string;
	label: string;
	logo?: string | null;
};

type PartialPaymentDialogProps = {
	trigger: React.ReactNode;
	cardId: string;
	period: string;
	totalAmount: number;
	defaultPaymentAccountId: string | null;
	paymentAccountOptions: PaymentAccountOption[];
};

export function PartialPaymentDialog({
	trigger,
	cardId,
	period,
	totalAmount,
	defaultPaymentAccountId,
	paymentAccountOptions,
}: PartialPaymentDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const totalAbs = Math.abs(totalAmount);
	const [amount, setAmount] = useState<string>((totalAbs / 2).toFixed(2));
	const [accountId, setAccountId] = useState<string>(
		defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
	);
	const [paymentDate, setPaymentDate] = useState<string>(
		new Date().toISOString().split("T")[0] ?? "",
	);

	useEffect(() => {
		if (open) {
			setAmount((totalAbs / 2).toFixed(2));
			setAccountId(
				defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
			);
			setPaymentDate(new Date().toISOString().split("T")[0] ?? "");
		}
	}, [open, totalAbs, defaultPaymentAccountId, paymentAccountOptions]);

	const amountPaid = Number(amount);
	const remainder = Number.isFinite(amountPaid)
		? Math.round((totalAbs - amountPaid) * 100) / 100
		: totalAbs;
	const selectedAccount = paymentAccountOptions.find(
		(option) => option.value === accountId,
	);

	const handleConfirm = () => {
		if (!Number.isFinite(amountPaid) || amountPaid <= 0) {
			toast.error("Informe um valor válido.");
			return;
		}
		if (amountPaid >= totalAbs) {
			toast.error(
				'O valor cobre a fatura inteira — use "Marcar como paga" em vez disso.',
			);
			return;
		}
		if (!accountId) {
			toast.error("Selecione uma conta para pagar a fatura.");
			return;
		}

		startTransition(async () => {
			const result = await payInvoicePartiallyAction({
				cardId,
				period,
				amountPaid,
				paymentDate,
				paymentAccountId: accountId,
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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Pagar parcialmente</DialogTitle>
					<DialogDescription>
						O valor que não for pago agora vira um lançamento de "Saldo
						financiado" na fatura do mês seguinte, sem juros.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
						<p className="text-muted-foreground">Total da fatura</p>
						<p className="font-medium text-foreground">
							{formatCurrency(totalAbs)}
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="partial-payment-amount">Valor a pagar agora</Label>
						<CurrencyInput
							id="partial-payment-amount"
							value={amount}
							onValueChange={setAmount}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">
							Restante: {formatCurrency(Math.max(remainder, 0))}
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="partial-payment-account">Conta de pagamento</Label>
						<Select
							value={accountId}
							onValueChange={setAccountId}
							disabled={isPending || paymentAccountOptions.length === 0}
						>
							<SelectTrigger id="partial-payment-account" className="w-full">
								<SelectValue placeholder="Selecione uma conta">
									{selectedAccount ? (
										<AccountCardSelectContent
											label={selectedAccount.label}
											logo={selectedAccount.logo}
										/>
									) : null}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{paymentAccountOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<AccountCardSelectContent
											label={option.label}
											logo={option.logo}
										/>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="partial-payment-date">Data do pagamento</Label>
						<DatePicker
							id="partial-payment-date"
							value={paymentDate}
							onChange={(value) => value && setPaymentDate(value)}
							disabled={isPending}
						/>
					</div>
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
						disabled={isPending || paymentAccountOptions.length === 0}
					>
						{isPending ? "Confirmando..." : "Confirmar pagamento parcial"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
