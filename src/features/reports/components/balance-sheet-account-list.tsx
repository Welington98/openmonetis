import Image from "next/image";
import type { BalanceSheetAccount } from "@/features/reports/lib/balance-sheet-classification";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { formatCurrency } from "@/shared/utils/currency";

type BalanceSheetAccountListProps = {
	title: string;
	accounts: BalanceSheetAccount[];
	emptyLabel: string;
	valueClassName?: string;
};

export function BalanceSheetAccountList({
	title,
	accounts,
	emptyLabel,
	valueClassName,
}: BalanceSheetAccountListProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle>{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-1">
				{accounts.length === 0 ? (
					<p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>
				) : (
					accounts.map((account) => {
						const logoSrc = resolveLogoSrc(account.logo) ?? undefined;
						const displayValue =
							account.classification === "passivo"
								? Math.abs(account.balance)
								: account.balance;

						return (
							<div
								key={account.id}
								className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
							>
								<div className="flex items-center gap-3 min-w-0">
									{logoSrc ? (
										<Image
											src={logoSrc}
											alt=""
											width={28}
											height={28}
											className="size-7 rounded-md object-contain shrink-0"
										/>
									) : (
										<div className="size-7 rounded-md bg-muted shrink-0" />
									)}
									<div className="min-w-0">
										<p className="text-sm font-medium truncate">
											{account.name}
										</p>
										<p className="text-xs text-muted-foreground truncate">
											{account.accountType}
										</p>
									</div>
								</div>
								<span
									className={`text-sm font-medium shrink-0 ${valueClassName ?? ""}`}
								>
									{formatCurrency(displayValue)}
								</span>
							</div>
						);
					})
				)}
			</CardContent>
		</Card>
	);
}
