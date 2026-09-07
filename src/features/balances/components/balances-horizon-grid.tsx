"use client";

import { useMemo } from "react";
import type { BalanceProjectionRow } from "@/features/balances/lib/balance-projection";
import { getBalanceCellTone } from "@/features/balances/lib/balance-tone";
import type { BalanceProjectionOverview } from "@/features/balances/queries";
import { usePrivacyMode } from "@/shared/components/providers/privacy-provider";
import { Card } from "@/shared/components/ui/card";
import { formatCurrencyCompact } from "@/shared/utils/currency";
import { formatCompactPeriodLabel } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

/**
 * Mapa de calor: todos os meses da janela lado a lado, colunas estreitas,
 * só dia + saldo abreviado. Não usa `MoneyValues` por célula (que consome
 * `usePrivacyMode()` via contexto) — lê o modo privacidade uma vez na raiz
 * e aplica o blur direto na célula, pra não multiplicar consumidores de
 * contexto por ~365 dias.
 */
export function BalancesHorizonGrid({
	overview,
}: {
	overview: BalanceProjectionOverview;
}) {
	const { projection, warningThreshold } = overview;
	const { privacyMode } = usePrivacyMode();

	const months = useMemo(() => {
		const byMonth = new Map<string, BalanceProjectionRow[]>();
		for (const row of projection.rows) {
			const period = row.date.slice(0, 7);
			const list = byMonth.get(period) ?? [];
			list.push(row);
			byMonth.set(period, list);
		}
		return Array.from(byMonth.entries()).map(([period, rows]) => ({
			period,
			rows,
		}));
	}, [projection.rows]);

	const referenceMagnitude = useMemo(
		() => Math.max(...projection.rows.map((row) => Math.abs(row.balance)), 1),
		[projection.rows],
	);

	if (months.length === 0) {
		return null;
	}

	return (
		<Card className="p-5">
			<h3 className="mb-1 text-sm font-medium text-muted-foreground">
				Horizonte
			</h3>
			<p className="mb-4 text-xs text-muted-foreground">
				Saldo projetado de cada dia, todos os meses da janela lado a lado.
			</p>

			<div className="overflow-x-auto scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				<div className="flex gap-3">
					{months.map((month) => (
						<div key={month.period} className="shrink-0">
							<p className="mb-1 text-center text-xs font-medium text-muted-foreground capitalize">
								{formatCompactPeriodLabel(month.period)}
							</p>
							<table className="text-xs">
								<tbody>
									{month.rows.map((row) => {
										const tone = getBalanceCellTone(
											row.balance,
											warningThreshold,
											referenceMagnitude,
										);
										return (
											<tr
												key={row.date}
												className={row.isToday ? "bg-primary/10" : undefined}
											>
												<td className="py-0.5 pr-1.5 text-right text-muted-foreground/70 tabular-nums">
													{row.date.slice(-2)}
												</td>
												<td
													className={cn(
														"rounded-sm px-1.5 py-0.5 text-right tabular-nums transition-colors",
														tone.background,
														tone.text,
														tone.isSolid && "font-semibold",
														privacyMode && "blur-sm select-none",
													)}
												>
													{formatCurrencyCompact(row.balance, {
														minimumFractionDigits: 1,
														maximumFractionDigits: 1,
													})}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					))}
				</div>
			</div>

			<p className="mt-3 text-xs text-muted-foreground">
				Recorrências e parcelas só existem no banco até o horizonte com que
				foram criadas — uma série antiga pode não estar lançada até o fim desta
				janela, o que faria o mês parecer mais saudável do que é de verdade.
			</p>
		</Card>
	);
}
