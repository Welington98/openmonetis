import { getBalanceTextClass } from "@/features/balances/lib/balance-tone";
import type { BalanceProjectionOverview } from "@/features/balances/queries";
import MoneyValues from "@/shared/components/money-values";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatDateOnlyLabel } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

export function BalancesSummary({
	overview,
}: {
	overview: BalanceProjectionOverview;
}) {
	const { projection, warningThreshold } = overview;
	const { rows, startingBalance } = projection;

	if (rows.length === 0) {
		return null;
	}

	let lowest = rows[0];
	for (const row of rows) {
		if (row.balance < lowest.balance) {
			lowest = row;
		}
	}

	const firstNegative = rows.find((row) => row.balance < 0);

	return (
		<div className="grid gap-3 sm:grid-cols-3">
			<Card>
				<CardContent className="space-y-1">
					<p className="text-xs text-muted-foreground">Saldo inicial</p>
					<MoneyValues
						amount={startingBalance}
						className="text-lg font-semibold"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="space-y-1">
					<p className="text-xs text-muted-foreground">Menor saldo da janela</p>
					<MoneyValues
						amount={lowest.balance}
						className={cn(
							"text-lg font-semibold",
							getBalanceTextClass(lowest.balance, warningThreshold),
						)}
					/>
					<p className="text-xs text-muted-foreground">
						{formatDateOnlyLabel(lowest.date)}
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="space-y-1">
					<p className="text-xs text-muted-foreground">Fica negativo em</p>
					{firstNegative ? (
						<p className="text-lg font-semibold text-destructive">
							{formatDateOnlyLabel(firstNegative.date)}
						</p>
					) : (
						<p className="text-lg font-semibold text-success">
							Não fica, nessa janela
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
