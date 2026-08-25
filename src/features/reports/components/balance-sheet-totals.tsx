import type { BalanceSheetTotals as BalanceSheetTotalsType } from "@/features/reports/lib/balance-sheet-classification";
import { Card, CardContent } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

type BalanceSheetTotalsProps = {
	totals: BalanceSheetTotalsType;
};

export function BalanceSheetTotals({ totals }: BalanceSheetTotalsProps) {
	const isNegativeNetWorth = totals.patrimonioLiquido < 0;

	return (
		<div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
			<Card>
				<CardContent className="p-4">
					<p className="text-xs text-muted-foreground">Ativo</p>
					<p className="text-xl font-semibold text-success">
						{formatCurrency(totals.ativo)}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-4">
					<p className="text-xs text-muted-foreground">Passivo</p>
					<p className="text-xl font-semibold text-destructive">
						{formatCurrency(totals.passivo)}
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent className="p-4">
					<p className="text-xs text-muted-foreground">Patrimônio líquido</p>
					<p
						className={`text-xl font-semibold ${isNegativeNetWorth ? "text-destructive" : "text-info"}`}
					>
						{formatCurrency(totals.patrimonioLiquido)}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
