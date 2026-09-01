import MoneyValues from "@/shared/components/money-values";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { Card } from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import type { PayablePaymentAccountOption } from "../types";

type AccountSummary = {
	account: PayablePaymentAccountOption;
	amount: number;
};

type PayablesSidebarProps = {
	activeTab: "pagar" | "receber";
	payableTotal: number;
	receivableTotal: number;
	accountSummaries: AccountSummary[];
	selectedAccountIds: Set<string>;
	allAccountsSelected: boolean;
	onToggleAccount: (accountId: string) => void;
	onToggleAll: () => void;
};

export function PayablesSidebar({
	activeTab,
	payableTotal,
	receivableTotal,
	accountSummaries,
	selectedAccountIds,
	allAccountsSelected,
	onToggleAccount,
	onToggleAll,
}: PayablesSidebarProps) {
	const resultado = receivableTotal - payableTotal;
	const totalLabel =
		activeTab === "pagar" ? "Total a pagar" : "Total a receber";
	const grandTotal = accountSummaries.reduce(
		(total, summary) => total + summary.amount,
		0,
	);

	return (
		<div className="flex w-full flex-col gap-3 lg:w-72 lg:shrink-0">
			<MonthNavigation />

			<Card className="space-y-2.5 p-4 text-sm">
				<p className="text-xs font-medium text-muted-foreground uppercase">
					Resultado do período
				</p>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">A pagar</span>
					<MoneyValues
						amount={-payableTotal}
						className="font-medium text-destructive"
					/>
				</div>
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">A receber</span>
					<MoneyValues
						amount={receivableTotal}
						className="font-medium text-success"
					/>
				</div>
				<div className="flex items-center justify-between border-t pt-2 font-semibold">
					<span>Resultado</span>
					<MoneyValues amount={resultado} />
				</div>
			</Card>

			<Card className="space-y-3 p-4">
				<div className="flex items-center justify-between gap-2">
					<label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm font-medium">
						<Checkbox
							checked={allAccountsSelected}
							onCheckedChange={onToggleAll}
						/>
						<span>Contas</span>
					</label>
					<span className="shrink-0 text-xs text-muted-foreground">
						{totalLabel}
					</span>
				</div>

				<ul className="space-y-2.5">
					{accountSummaries.map(({ account, amount }) => (
						<li
							key={account.value}
							className="flex items-center justify-between gap-2 text-sm"
						>
							<label className="flex min-w-0 cursor-pointer items-center gap-2">
								<Checkbox
									checked={selectedAccountIds.has(account.value)}
									onCheckedChange={() => onToggleAccount(account.value)}
								/>
								<span className="truncate">{account.label}</span>
							</label>
							<MoneyValues amount={amount} className="shrink-0 text-xs" />
						</li>
					))}
				</ul>

				<div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
					<span>Total</span>
					<MoneyValues amount={grandTotal} />
				</div>
			</Card>
		</div>
	);
}
