import type { LoanInstallmentRow, LoanSummary } from "@/features/loans/queries";
import MoneyValues from "@/shared/components/money-values";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
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
							<tr
								key={row.installmentNumber}
								className="border-b last:border-0"
							>
								<td className="py-2 pr-3">{row.installmentNumber}</td>
								<td className="py-2 pr-3 whitespace-nowrap">
									{formatDateOnlyLabel(row.dueDate)}
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
