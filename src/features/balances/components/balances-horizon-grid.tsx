"use client";

import { useMemo, useState } from "react";
import type { BalanceProjectionRow } from "@/features/balances/lib/balance-projection";
import { getBalanceCellTone } from "@/features/balances/lib/balance-tone";
import type { BalanceProjectionOverview } from "@/features/balances/queries";
import NavigationButton from "@/shared/components/month-picker/nav-button";
import { usePrivacyMode } from "@/shared/components/providers/privacy-provider";
import { Card } from "@/shared/components/ui/card";
import { formatCurrencyCompact } from "@/shared/utils/currency";
import { formatCompactPeriodLabel } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

/** 3 meses por página — mais que isso espremia demais pra ler os valores. */
const MONTHS_PER_PAGE = 3;

/**
 * Mapa de calor tipo planilha: 3 meses por vez, lado a lado, com botões pra
 * passar pros próximos/anteriores em vez de rolagem horizontal pelos 12
 * meses de uma vez. Célula preenche a largura toda (sem cantos
 * arredondados nem espaço em volta) pra parecer uma célula de planilha de
 * verdade, não um chip flutuante.
 *
 * Não usa `MoneyValues` por célula (que consome `usePrivacyMode()` via
 * contexto) — lê o modo privacidade uma vez na raiz e aplica o blur direto
 * na célula, pra não multiplicar consumidores de contexto por ~90 dias
 * visíveis de uma vez.
 */
export function BalancesHorizonGrid({
	overview,
}: {
	overview: BalanceProjectionOverview;
}) {
	const { projection, warningThreshold } = overview;
	const { privacyMode } = usePrivacyMode();
	const [page, setPage] = useState(0);

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

	const pageCount = Math.max(Math.ceil(months.length / MONTHS_PER_PAGE), 1);
	const clampedPage = Math.min(page, pageCount - 1);
	const visibleMonths = months.slice(
		clampedPage * MONTHS_PER_PAGE,
		clampedPage * MONTHS_PER_PAGE + MONTHS_PER_PAGE,
	);

	if (months.length === 0) {
		return null;
	}

	return (
		<Card className="p-5">
			<div className="mb-4 flex items-center justify-between gap-2">
				<div>
					<h3 className="text-sm font-medium text-muted-foreground">
						Horizonte
					</h3>
					<p className="text-xs text-muted-foreground">
						Saldo projetado de cada dia, 3 meses por vez.
					</p>
				</div>
				<div className="flex items-center gap-1">
					<NavigationButton
						direction="left"
						disabled={clampedPage === 0}
						onClick={() => setPage((current) => current - 1)}
					/>
					<span className="text-xs text-muted-foreground">
						{clampedPage + 1}/{pageCount}
					</span>
					<NavigationButton
						direction="right"
						disabled={clampedPage >= pageCount - 1}
						onClick={() => setPage((current) => current + 1)}
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				{visibleMonths.map((month) => (
					<div key={month.period}>
						<p className="mb-1 text-center text-xs font-medium text-muted-foreground capitalize">
							{formatCompactPeriodLabel(month.period)}
						</p>
						<table className="w-full border-collapse text-xs">
							<tbody>
								{month.rows.map((row) => {
									const tone = getBalanceCellTone(
										row.balance,
										warningThreshold,
									);
									return (
										<tr key={row.date}>
											<td
												className={cn(
													"w-8 border-b border-border/60 py-1 pr-1.5 text-right tabular-nums",
													row.isToday
														? "font-bold text-primary"
														: "text-muted-foreground/70",
												)}
											>
												{row.date.slice(-2)}
											</td>
											<td
												className={cn(
													"border-b border-border/60 px-2 py-1 text-right font-semibold tabular-nums transition-colors",
													tone.background,
													tone.text,
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

			<p className="mt-4 text-xs text-muted-foreground">
				Recorrências e parcelas só existem no banco até o horizonte com que
				foram criadas — uma série antiga pode não estar lançada até o fim desta
				janela, o que faria o mês parecer mais saudável do que é de verdade.
			</p>
		</Card>
	);
}
