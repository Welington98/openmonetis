"use client";

import { useMemo, useState } from "react";
import type { BalanceProjectionRow } from "@/features/balances/lib/balance-projection";
import { getBalanceCellTone } from "@/features/balances/lib/balance-tone";
import type { BalanceProjectionOverview } from "@/features/balances/queries";
import { InfoTooltip } from "@/shared/components/info-tooltip";
import MoneyValues from "@/shared/components/money-values";
import NavigationButton from "@/shared/components/month-picker/nav-button";
import { Card } from "@/shared/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatDateOnlyLabel } from "@/shared/utils/date";
import { formatMonthYearLabel } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type BucketKey = "daily" | "income" | "expenses" | "savings" | "card";

const BUCKET_LABEL: Record<BucketKey, string> = {
	daily: "Diários",
	income: "Entradas",
	expenses: "Saídas",
	savings: "Economias",
	card: "Cartão",
};

const BUCKET_TONE: Record<BucketKey, string> = {
	income: "text-success",
	daily: "text-destructive",
	expenses: "text-destructive",
	savings: "text-destructive",
	card: "text-destructive",
};

const DAILY_COLUMN_HELP = [
	"Nos dias já passados: o que você realmente gastou no dia a dia.",
	"Nos dias futuros sem lançamento ainda: uma cota estimada, dividida do orçamento que sobrou no mês.",
	"Some (fica R$ 0,00) quando o orçamento variável do mês já está estourado.",
] as const;

const CARD_COLUMN_HELP = [
	"Fatura de cartão não paga, lançada de uma vez no dia do vencimento — não na data da compra.",
	"A compra em si não aparece em nenhuma outra coluna: ela só vira saída quando a fatura vence.",
	"Fatura já paga não entra aqui — o pagamento já está refletido no saldo inicial.",
] as const;

const BALANCE_COLUMN_HELP = [
	"Saldo acumulado da conta ao final daquele dia, considerando tudo que entrou e saiu até ali.",
	"Verde é confortável, amarelo é atenção (positivo mas abaixo da reserva), rosa é negativo dentro da margem, vermelho é negativo além da margem.",
] as const;

const BUCKET_HELP: Partial<Record<BucketKey, readonly string[]>> = {
	daily: DAILY_COLUMN_HELP,
	card: CARD_COLUMN_HELP,
};

function ThLabel({
	label,
	helpLines,
	align = "left",
}: {
	label: string;
	helpLines?: readonly string[];
	align?: "left" | "right";
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1",
				align === "right" && "flex-row-reverse",
			)}
		>
			{label}
			{helpLines && (
				<InfoTooltip label={label} helpTitle={label} helpLines={helpLines} />
			)}
		</span>
	);
}

function bucketValue(row: BalanceProjectionRow, bucket: BucketKey): number {
	switch (bucket) {
		case "income":
			return row.income;
		case "expenses":
			return row.expenses;
		case "savings":
			return row.savings;
		case "card":
			return row.card;
		default:
			return row.daily;
	}
}

function ValueCell({
	amount,
	toneClassName,
}: {
	amount: number;
	toneClassName?: string;
}) {
	return (
		<MoneyValues
			amount={amount}
			className={amount === 0 ? "text-muted-foreground/50" : toneClassName}
		/>
	);
}

function BalanceCell({
	row,
	warningThreshold,
}: {
	row: BalanceProjectionRow;
	warningThreshold: number;
}) {
	const tone = getBalanceCellTone(row.balance, warningThreshold);

	return (
		<td
			className={cn("px-2 py-2 text-right transition-colors", tone.background)}
		>
			<MoneyValues
				amount={row.balance}
				className={cn("font-semibold", tone.text)}
			/>
		</td>
	);
}

/**
 * Uma tabela por vez, um mês por vez — mesmo padrão de
 * `daily-budget-projection-table.tsx` (`useState` + chevrons). Evita
 * renderizar os ~365 dias da janela inteira de uma vez: `MoneyValues` é
 * consumidor de `usePrivacyMode()`, então 365 × 7 colunas seriam ~2500
 * consumidores de contexto numa página só.
 *
 * Mobile não cabe 7 colunas: fixa "Dia" e "Saldos" e deixa a coluna do meio
 * escolhível por um dropdown (ver print de referência), desktop mostra as 7
 * de uma vez.
 */
export function BalancesTable({
	overview,
}: {
	overview: BalanceProjectionOverview;
}) {
	const { projection, warningThreshold } = overview;
	const [bucket, setBucket] = useState<BucketKey>("daily");
	const [selectedIndex, setSelectedIndex] = useState(0);

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

	const month = months[Math.min(selectedIndex, Math.max(months.length - 1, 0))];

	if (!month) return null;

	return (
		<Card className="p-5">
			<div className="mb-4 flex items-center justify-between gap-2">
				<h3 className="text-sm font-medium text-muted-foreground">
					Saldo diário
				</h3>
				<div className="flex items-center gap-1">
					<NavigationButton
						direction="left"
						disabled={selectedIndex === 0}
						onClick={() => setSelectedIndex((index) => index - 1)}
					/>
					<span className="min-w-28 text-center text-sm font-medium capitalize">
						{formatMonthYearLabel(month.period)}
					</span>
					<NavigationButton
						direction="right"
						disabled={selectedIndex === months.length - 1}
						onClick={() => setSelectedIndex((index) => index + 1)}
					/>
				</div>
			</div>

			{/* Mobile: Dia + balde selecionável + Saldos */}
			<div className="md:hidden">
				<Select
					value={bucket}
					onValueChange={(value) => setBucket(value as BucketKey)}
				>
					<SelectTrigger className="mb-3 w-40">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{(Object.keys(BUCKET_LABEL) as BucketKey[]).map((key) => (
							<SelectItem key={key} value={key}>
								{BUCKET_LABEL[key]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<table className="w-full text-sm">
					<thead>
						<tr className="border-b text-left text-xs text-muted-foreground">
							<th className="py-2 pr-3 font-normal">Dia</th>
							<th className="py-2 pr-3 font-normal">
								<ThLabel
									label={BUCKET_LABEL[bucket]}
									helpLines={BUCKET_HELP[bucket]}
								/>
							</th>
							<th className="py-2 pr-3 text-right font-normal">
								<ThLabel
									label="Saldos"
									helpLines={BALANCE_COLUMN_HELP}
									align="right"
								/>
							</th>
						</tr>
					</thead>
					<tbody>
						{month.rows.map((row) => (
							<tr
								key={row.date}
								className={cn(
									"border-b last:border-0",
									row.isToday && "bg-primary/5 font-medium",
								)}
							>
								<td className="py-2 pr-3 whitespace-nowrap">
									{formatDateOnlyLabel(row.date)}
									{row.isToday && (
										<span className="ml-2 text-xs text-primary">hoje</span>
									)}
								</td>
								<td className="py-2 pr-3">
									<ValueCell
										amount={bucketValue(row, bucket)}
										toneClassName={BUCKET_TONE[bucket]}
									/>
								</td>
								<BalanceCell row={row} warningThreshold={warningThreshold} />
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{/* Desktop: as 7 colunas de uma vez */}
			<div className="hidden overflow-x-auto md:block">
				<table className="w-full min-w-[720px] text-sm">
					<thead>
						<tr className="border-b text-left text-xs text-muted-foreground">
							<th className="py-2 pr-3 font-normal">Dia</th>
							<th className="py-2 pr-3 font-normal">Entradas</th>
							<th className="py-2 pr-3 font-normal">Saídas</th>
							<th className="py-2 pr-3 font-normal">
								<ThLabel label="Diários" helpLines={DAILY_COLUMN_HELP} />
							</th>
							<th className="py-2 pr-3 font-normal">Economias</th>
							<th className="py-2 pr-3 font-normal">
								<ThLabel label="Cartão" helpLines={CARD_COLUMN_HELP} />
							</th>
							<th className="py-2 pr-3 text-right font-normal">
								<ThLabel
									label="Saldos"
									helpLines={BALANCE_COLUMN_HELP}
									align="right"
								/>
							</th>
						</tr>
					</thead>
					<tbody>
						{month.rows.map((row) => (
							<tr
								key={row.date}
								className={cn(
									"border-b last:border-0",
									row.isToday && "bg-primary/5 font-medium",
								)}
							>
								<td className="py-2 pr-3 whitespace-nowrap">
									{formatDateOnlyLabel(row.date)}
									{row.isToday && (
										<span className="ml-2 text-xs text-primary">hoje</span>
									)}
								</td>
								<td className="py-2 pr-3">
									<ValueCell amount={row.income} toneClassName="text-success" />
								</td>
								<td className="py-2 pr-3">
									<ValueCell
										amount={row.expenses}
										toneClassName="text-destructive"
									/>
								</td>
								<td className="py-2 pr-3">
									<ValueCell
										amount={row.daily}
										toneClassName="text-destructive"
									/>
								</td>
								<td className="py-2 pr-3">
									<ValueCell
										amount={row.savings}
										toneClassName="text-destructive"
									/>
								</td>
								<td className="py-2 pr-3">
									<ValueCell
										amount={row.card}
										toneClassName="text-destructive"
									/>
								</td>
								<BalanceCell row={row} warningThreshold={warningThreshold} />
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</Card>
	);
}
