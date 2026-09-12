"use client";

import { useEffect, useState } from "react";
import MoneyValues from "@/shared/components/money-values";
import { Button } from "@/shared/components/ui/button";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Spinner } from "@/shared/components/ui/spinner";
import { getTodayDateString } from "@/shared/utils/date";
import { AccountCardSelectContent } from "../select-items";
import type { SelectOption, TransactionItem } from "../types";

type GroupSettleDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: TransactionItem[];
	accountOptions: SelectOption[];
	onConfirm: (data: {
		paymentDate: string;
		paymentAccountId: string | null;
	}) => Promise<void>;
};

export function GroupSettleDialog({
	open,
	onOpenChange,
	items,
	accountOptions,
	onConfirm,
}: GroupSettleDialogProps) {
	const [paymentDate, setPaymentDate] = useState(getTodayDateString());
	const [accountId, setAccountId] = useState<string>("");
	const [isPending, setIsPending] = useState(false);

	useEffect(() => {
		if (open) {
			setPaymentDate(getTodayDateString());
			setAccountId("");
		}
	}, [open]);

	const total = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
	const isIncome = total >= 0;

	const handleConfirm = async () => {
		setIsPending(true);
		try {
			await onConfirm({
				paymentDate,
				paymentAccountId: accountId || null,
			});
			onOpenChange(false);
		} finally {
			setIsPending(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						Agrupar {items.length} lançamentos e marcar como{" "}
						{isIncome ? "recebido" : "pago"}
					</DialogTitle>
					<DialogDescription>
						Os lançamentos selecionados serão marcados como{" "}
						{isIncome ? "recebidos" : "pagos"} de uma só vez, no valor total
						abaixo — útil quando você envia ou recebe um único valor que
						representa a soma de vários lançamentos.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-md border bg-muted/40 px-3 py-2">
						<p className="text-xs text-muted-foreground">
							Total dos {items.length} lançamentos selecionados
						</p>
						<MoneyValues
							amount={total}
							className="text-lg font-semibold text-foreground"
						/>
					</div>

					<div className="space-y-1">
						<Label htmlFor="group-settle-date">
							Data de {isIncome ? "recebimento" : "pagamento"}
						</Label>
						<DatePicker
							id="group-settle-date"
							value={paymentDate}
							onChange={setPaymentDate}
							placeholder="Selecione a data"
						/>
					</div>

					{accountOptions.length > 0 ? (
						<div className="space-y-1">
							<Label htmlFor="group-settle-account">
								Conta de {isIncome ? "recebimento" : "pagamento"} (opcional)
							</Label>
							<Select value={accountId} onValueChange={setAccountId}>
								<SelectTrigger id="group-settle-account" className="w-full">
									<SelectValue placeholder="Manter conta de cada lançamento">
										{accountId
											? (() => {
													const selected = accountOptions.find(
														(opt) => opt.value === accountId,
													);
													return selected ? (
														<AccountCardSelectContent
															label={selected.label}
															logo={selected.logo}
															isCartao={false}
														/>
													) : null;
												})()
											: null}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{accountOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<AccountCardSelectContent
												label={option.label}
												logo={option.logo}
												isCartao={false}
											/>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleConfirm} disabled={isPending}>
						{isPending ? (
							<>
								<Spinner className="size-4" />
								Marcando...
							</>
						) : (
							`Marcar como ${isIncome ? "recebido" : "pago"}`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
