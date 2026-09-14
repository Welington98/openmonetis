"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { payLoanInstallmentAction } from "@/features/loans/actions";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { getBusinessDateString } from "@/shared/utils/date";

type PaymentAccountOption = { id: string; name: string };

type PayInstallmentDialogProps = {
	installmentId: string;
	installmentLabel: string;
	defaultPaymentAccountId: string;
	paymentAccountOptions: PaymentAccountOption[];
	trigger: React.ReactNode;
};

export function PayInstallmentDialog({
	installmentId,
	installmentLabel,
	defaultPaymentAccountId,
	paymentAccountOptions,
	trigger,
}: PayInstallmentDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [paymentDate, setPaymentDate] = useState(getBusinessDateString());
	const [paymentAccountId, setPaymentAccountId] = useState(
		defaultPaymentAccountId,
	);

	const handleSave = () => {
		startTransition(async () => {
			const result = await payLoanInstallmentAction({
				installmentId,
				paymentDate,
				paymentAccountId,
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
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) {
					setPaymentDate(getBusinessDateString());
					setPaymentAccountId(defaultPaymentAccountId);
				}
			}}
		>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Pagar parcela {installmentLabel}</DialogTitle>
					<DialogDescription>
						Registra a transferência da conta de pagamento pra conta de
						empréstimo, liquidando essa parcela.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="pay-installment-date">Data do pagamento</Label>
						<Input
							id="pay-installment-date"
							type="date"
							value={paymentDate}
							onChange={(event) => setPaymentDate(event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="pay-installment-account">Conta de pagamento</Label>
						<Select
							value={paymentAccountId}
							onValueChange={setPaymentAccountId}
						>
							<SelectTrigger id="pay-installment-account" className="w-full">
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
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleSave} disabled={isPending}>
						{isPending ? "Salvando..." : "Confirmar pagamento"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
