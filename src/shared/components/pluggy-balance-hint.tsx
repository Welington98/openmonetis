"use client";

import MoneyValues from "@/shared/components/money-values";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

type PluggyBalanceHintProps = {
	localBalance: number;
	pluggyBalance: number;
	inline?: boolean;
};

/**
 * Mostra entre parênteses o saldo informado pelo Pluggy ao lado do saldo local.
 * Em destaque (âmbar) quando os dois divergem — sinal de que falta conciliação.
 */
export function PluggyBalanceHint({
	localBalance,
	pluggyBalance,
	inline = false,
}: PluggyBalanceHintProps) {
	const difference = Math.round((pluggyBalance - localBalance) * 100) / 100;
	const diverges = difference !== 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						"inline-flex cursor-help items-baseline gap-1 text-xs",
						inline ? "leading-4" : "mt-0.5",
						diverges
							? "text-amber-600 dark:text-amber-400"
							: "text-muted-foreground",
					)}
				>
					(<MoneyValues amount={pluggyBalance} />)
				</span>
			</TooltipTrigger>
			<TooltipContent side="top" className="max-w-xs">
				<p className="text-xs">
					{diverges
						? `Saldo no Pluggy difere do saldo local em ${formatCurrency(
								Math.abs(difference),
							)} — pode faltar conciliação.`
						: "Saldo no Pluggy confere com o saldo local."}
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
