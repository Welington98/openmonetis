"use client";

import { RiPencilLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateLoanInstallmentDueDateAction } from "@/features/loans/actions";
import type { LoanInstallmentRow, LoanSummary } from "@/features/loans/queries";
import MoneyValues from "@/shared/components/money-values";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { formatDateOnlyLabel } from "@/shared/utils/date";
import { formatPercentage } from "@/shared/utils/percentage";

type LoanAmortizationTableProps = {
	loan: LoanSummary;
	schedule: LoanInstallmentRow[];
	onEdit: () => void;
};

export function LoanAmortizationTable({
	loan,
	schedule,
	onEdit,
}: LoanAmortizationTableProps) {
	const paidCount = schedule.filter((row) => row.isSettled).length;
	const outstanding = schedule
		.filter((row) => !row.isSettled)
		.reduce((total, row) => total + row.principalAmount, 0);

	return (
		<Card className="p-6">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="text-lg font-semibold">Tabela de amortização</h2>
					<p className="text-sm text-muted-foreground">
						{loan.amortizationSystem === "price" ? "Price" : "SAC"} ·{" "}
						{formatPercentage(loan.interestRateMonthly, {
							minimumFractionDigits: 2,
							maximumFractionDigits: 4,
						})}{" "}
						a.m. · {paidCount}/{loan.installmentCount} parcelas pagas
					</p>
				</div>
				<div className="flex items-center gap-4">
					<div className="text-right">
						<p className="text-xs text-muted-foreground">Saldo devedor</p>
						<MoneyValues
							amount={outstanding}
							className="text-lg font-semibold"
						/>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						Editar configuração
					</Button>
				</div>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full min-w-[640px] text-sm">
					<thead>
						<tr className="border-b text-left text-xs text-muted-foreground">
							<th className="py-2 pr-3 font-normal">Nº</th>
							<th className="py-2 pr-3 font-normal">Vencimento</th>
							<th className="py-2 pr-3 font-normal">Valor</th>
							<th className="py-2 pr-3 font-normal">Principal</th>
							<th className="py-2 pr-3 font-normal">Juros</th>
							<th className="py-2 pr-3 font-normal">Saldo devedor</th>
							<th className="py-2 pr-3 font-normal">Status</th>
						</tr>
					</thead>
					<tbody>
						{schedule.map((row) => (
							<tr key={row.id} className="border-b last:border-0">
								<td className="py-2 pr-3">{row.installmentNumber}</td>
								<td className="py-2 pr-3 whitespace-nowrap">
									{row.isSettled ? (
										formatDateOnlyLabel(row.dueDate)
									) : (
										<InstallmentDueDateEditor
											installmentId={row.id}
											dueDate={row.dueDate}
										/>
									)}
								</td>
								<td className="py-2 pr-3">
									<MoneyValues amount={row.totalAmount} />
								</td>
								<td className="py-2 pr-3">
									<MoneyValues amount={row.principalAmount} />
								</td>
								<td className="py-2 pr-3">
									<MoneyValues amount={row.interestAmount} />
								</td>
								<td className="py-2 pr-3">
									<MoneyValues amount={row.remainingBalanceAfter} />
								</td>
								<td className="py-2 pr-3">
									<Badge variant={row.isSettled ? "default" : "outline"}>
										{row.isSettled ? "Pago" : "Pendente"}
									</Badge>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
}

/**
 * Só a data de vencimento é editável parcela-a-parcela, direto na tabela —
 * ela não entra na matemática da amortização, então mudar só ela nunca
 * desalinha o saldo devedor das parcelas seguintes. Bloqueado pra parcelas
 * pagas (ver `updateLoanInstallmentDueDateAction`). Pra mudar o VALOR de uma
 * parcela, use "Editar configuração" — isso é o que recalcula o resto da
 * tabela com segurança.
 */
function InstallmentDueDateEditor({
	installmentId,
	dueDate,
}: {
	installmentId: string;
	dueDate: string;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState(dueDate);
	const [isPending, startTransition] = useTransition();

	const handleSave = () => {
		startTransition(async () => {
			const result = await updateLoanInstallmentDueDateAction({
				installmentId,
				dueDate: value,
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
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (next) setValue(dueDate);
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="inline-flex items-center gap-1 underline-offset-2 hover:text-primary hover:underline"
				>
					{formatDateOnlyLabel(dueDate)}
					<RiPencilLine className="size-3 text-muted-foreground" aria-hidden />
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-64 space-y-2" align="start">
				<p className="text-xs text-muted-foreground">
					Novo vencimento desta parcela
				</p>
				<Input
					type="date"
					value={value}
					onChange={(event) => setValue(event.target.value)}
				/>
				<div className="flex justify-end gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={handleSave}
						disabled={isPending}
					>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
