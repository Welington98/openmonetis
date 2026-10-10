"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { PossibleDuplicate } from "@/features/transactions/actions/import-action";
import {
	CategorySelectContent,
	PayerSelectContent,
} from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import MoneyValues from "@/shared/components/money-values";
import { TransactionTypeBadge } from "@/shared/components/transaction-type-badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";

const categoryGroupByTransactionType: Record<
	ImportedTransaction["transactionType"],
	string
> = {
	expense: "despesa",
	income: "receita",
};

export type ReviewRow = ImportedTransaction & {
	reviewId: string;
	selected: boolean;
	isDuplicate: boolean;
	// Parece com um lançamento já existente (sem match exato): só sugestão.
	possibleDuplicate: PossibleDuplicate | null;
	existingTransactionId: string | null;
	categoryId: string | null;
	payerId: string | null;
	// Compra parcelada: `installmentTotal` preenchido (2..60). `amount` é o valor
	// de uma parcela e a linha é a `installmentCurrent`.
	installmentCurrent: number | null;
	installmentTotal: number | null;
};

export function isInstallmentValid(row: ReviewRow) {
	if (row.installmentTotal === null && row.installmentCurrent === null) {
		return true;
	}
	return (
		row.installmentTotal !== null &&
		row.installmentTotal >= 2 &&
		row.installmentTotal <= 60 &&
		(row.installmentCurrent === null ||
			(row.installmentCurrent >= 1 &&
				row.installmentCurrent <= row.installmentTotal))
	);
}

const parseInstallmentInput = (value: string) => {
	if (value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : null;
};

interface ReviewTableProps {
	rows: ReviewRow[];
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	onToggle: (index: number) => void;
	onToggleAll: (selected: boolean) => void;
	onPayerChange: (index: number, payerId: string | null) => void;
	onCategoryChange: (index: number, categoryId: string | null) => void;
	onDescriptionChange: (index: number, description: string) => void;
	onInstallmentChange: (
		index: number,
		installment: { current: number | null; total: number | null },
	) => void;
	onUndoDuplicate: (index: number) => void;
}

export function ReviewTable({
	rows,
	payerOptions,
	categoryOptions,
	onToggle,
	onToggleAll,
	onPayerChange,
	onCategoryChange,
	onDescriptionChange,
	onInstallmentChange,
	onUndoDuplicate,
}: ReviewTableProps) {
	const allSelected = rows.every((r) => r.selected);
	const someSelected = rows.some((r) => r.selected);

	const parentRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		getItemKey: (index) => rows[index]?.reviewId ?? index,
		estimateSize: () => 44,
		overscan: 8,
	});

	const virtualRows = virtualizer.getVirtualItems();
	const totalSize = virtualizer.getTotalSize();
	const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
	const paddingBottom =
		virtualRows.length > 0
			? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
			: 0;

	return (
		<TooltipProvider>
			<div
				ref={parentRef}
				className="max-h-[480px] overflow-auto rounded-lg border"
			>
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-background">
						<TableRow>
							<TableHead className="w-10">
								<Checkbox
									checked={allSelected}
									onCheckedChange={(v) => onToggleAll(!!v)}
									aria-label="Selecionar todas"
									data-state={
										!allSelected && someSelected ? "indeterminate" : undefined
									}
								/>
							</TableHead>
							<TableHead className="w-24">Data</TableHead>
							<TableHead>Descrição</TableHead>
							<TableHead className="w-28">Parcela</TableHead>
							<TableHead className="w-44">Pessoa</TableHead>
							<TableHead className="w-44">Categoria</TableHead>
							<TableHead className="w-20">Tipo</TableHead>
							<TableHead className="w-28 text-right">Valor</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{paddingTop > 0 && (
							<TableRow>
								<TableCell
									colSpan={8}
									style={{ height: paddingTop, padding: 0 }}
								/>
							</TableRow>
						)}
						{virtualRows.map((virtualRow) => {
							const row = rows[virtualRow.index];
							if (!row) {
								return null;
							}
							const index = virtualRow.index;
							const categoryOptionsForRow = categoryOptions.filter(
								(option) =>
									option.group ===
									categoryGroupByTransactionType[row.transactionType],
							);
							return (
								<TableRow
									key={row.reviewId}
									className={
										(row.isDuplicate || row.possibleDuplicate) && !row.selected
											? "opacity-50"
											: ""
									}
								>
									<TableCell>
										<Checkbox
											checked={row.selected}
											onCheckedChange={() => onToggle(index)}
											aria-label={`Selecionar ${row.description}`}
										/>
									</TableCell>
									<TableCell className="text-muted-foreground text-sm">
										{formatDate(row.date)}
									</TableCell>
									<TableCell className="max-w-[200px] text-sm">
										<input
											type="text"
											value={row.description}
											onChange={(e) =>
												onDescriptionChange(index, e.target.value)
											}
											className="w-full bg-transparent text-sm outline-none focus:rounded focus:ring-1 focus:ring-ring"
										/>
										{row.possibleDuplicate && (
											<div className="mt-0.5">
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="cursor-default rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-amber-700 text-xs dark:text-amber-400">
															Possível duplicata
														</span>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															Parece com "{row.possibleDuplicate.name}" (
															{formatDate(row.possibleDuplicate.purchaseDate)},{" "}
															{formatCurrency(
																Math.abs(row.possibleDuplicate.amount),
															)}
															) já lançado. Marque a linha para importar mesmo
															assim.
														</p>
													</TooltipContent>
												</Tooltip>
											</div>
										)}
										{row.isDuplicate && (
											<div className="mt-0.5 flex items-center gap-1">
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="cursor-default rounded-sm bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
															Já importada
														</span>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															Esta transação já foi importada anteriormente.
														</p>
													</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															onClick={() => onUndoDuplicate(index)}
															className="rounded-sm px-1 py-0.5 text-xs text-primary underline-offset-2 hover:underline"
														>
															desfazer
														</button>
													</TooltipTrigger>
													<TooltipContent>
														<p>
															Remover a importação anterior e marcar para
															reimportar.
														</p>
													</TooltipContent>
												</Tooltip>
											</div>
										)}
									</TableCell>
									<TableCell>
										<div
											className={`flex items-center gap-1 text-xs ${
												isInstallmentValid(row) ? "" : "text-destructive"
											}`}
										>
											<input
												type="number"
												inputMode="numeric"
												min={1}
												max={60}
												placeholder="—"
												aria-label={`Parcela atual de ${row.description}`}
												value={row.installmentCurrent ?? ""}
												onChange={(e) =>
													onInstallmentChange(index, {
														current: parseInstallmentInput(e.target.value),
														total: row.installmentTotal,
													})
												}
												className="h-8 w-10 rounded border bg-transparent px-1 text-center outline-none focus:ring-1 focus:ring-ring"
											/>
											<span>/</span>
											<input
												type="number"
												inputMode="numeric"
												min={2}
												max={60}
												placeholder="—"
												aria-label={`Total de parcelas de ${row.description}`}
												value={row.installmentTotal ?? ""}
												onChange={(e) =>
													onInstallmentChange(index, {
														current: row.installmentCurrent,
														total: parseInstallmentInput(e.target.value),
													})
												}
												className="h-8 w-10 rounded border bg-transparent px-1 text-center outline-none focus:ring-1 focus:ring-ring"
											/>
										</div>
									</TableCell>
									<TableCell>
										<Select
											value={row.payerId ?? ""}
											onValueChange={(v) => onPayerChange(index, v || null)}
										>
											<SelectTrigger className="h-8 text-xs">
												<SelectValue placeholder="Pessoa…" />
											</SelectTrigger>
											<SelectContent>
												{payerOptions.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														<PayerSelectContent
															label={opt.label}
															avatarUrl={opt.avatarUrl}
														/>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell>
										<Select
											value={row.categoryId ?? ""}
											onValueChange={(v) => onCategoryChange(index, v || null)}
										>
											<SelectTrigger className="h-8 text-xs">
												<SelectValue placeholder="Categoria…" />
											</SelectTrigger>
											<SelectContent>
												{categoryOptionsForRow.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														<CategorySelectContent
															label={opt.label}
															icon={opt.icon}
														/>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</TableCell>
									<TableCell>
										<TransactionTypeBadge
											kind={
												row.transactionType === "income" ? "Receita" : "Despesa"
											}
										/>
									</TableCell>
									<TableCell className="text-right text-sm">
										<MoneyValues
											amount={
												row.transactionType === "expense"
													? -row.amount
													: row.amount
											}
											showPositiveSign={row.transactionType === "income"}
											className={
												row.transactionType === "income"
													? "text-success"
													: "text-foreground"
											}
										/>
									</TableCell>
								</TableRow>
							);
						})}
						{paddingBottom > 0 && (
							<TableRow>
								<TableCell
									colSpan={8}
									style={{ height: paddingBottom, padding: 0 }}
								/>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</TooltipProvider>
	);
}
