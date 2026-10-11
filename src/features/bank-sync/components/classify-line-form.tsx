"use client";

import { useState } from "react";
import { toast } from "sonner";
import { matchStatementLineAction } from "@/features/bank-sync/actions";
import type { SelectOption } from "@/features/transactions/components/types";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly, toDateOnlyString } from "@/shared/utils/date";
import {
	detectInstallments,
	type LineDraft,
	MAX_INSTALLMENTS,
	MIN_INSTALLMENTS,
} from "../lib/line-draft";
import type { StatementLineWithCategory } from "../queries";

interface ClassifyLineFormProps {
	line: StatementLineWithCategory;
	payerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
	/** Rascunho já salvo para esta linha (reidrata o formulário). */
	draft?: LineDraft;
	/** Guarda a classificação na tela; a importação acontece em lote depois. */
	onStage: (draft: LineDraft) => void;
	/** Descarta a classificação guardada. */
	onUnstage: () => void;
	/** Chamado depois de vincular a linha ao lançamento já existente sugerido. */
	onMatchedExisting?: () => void;
}

const categorySourceLabel: Record<string, string> = {
	mapping: "Sugerido pelo histórico",
	ai: "Sugerido pela IA",
	manual: "Selecionado por você",
};

export function ClassifyLineForm({
	line,
	payerOptions,
	defaultPayerId,
	accountOptions,
	cardOptions,
	categoryOptions,
	costCenterOptions,
	draft,
	onStage,
	onUnstage,
	onMatchedExisting,
}: ClassifyLineFormProps) {
	const isCardLine = line.pluggyAccountType === "CREDIT";
	const [isLinking, setIsLinking] = useState(false);
	const possibleDuplicate = line.possibleDuplicate ?? null;
	const detected = detectInstallments(line.description);
	const [transactionType, setTransactionType] = useState<"Despesa" | "Receita">(
		draft?.transactionType ?? (line.type === "receita" ? "Receita" : "Despesa"),
	);
	const [amount, setAmount] = useState(
		String(draft?.amount ?? Math.abs(Number(line.amount))),
	);
	const [description, setDescription] = useState(
		draft?.name ?? line.description,
	);
	const [purchaseDate, setPurchaseDate] = useState(
		draft?.purchaseDate ?? toDateOnlyString(line.date) ?? "",
	);
	const [accountId, setAccountId] = useState<string | null>(
		draft ? draft.accountId : line.linkedFinancialAccountId,
	);
	const [cardId, setCardId] = useState<string | null>(
		draft ? draft.cardId : line.linkedCardId,
	);
	const [categoryId, setCategoryId] = useState<string | null>(
		draft?.categoryId ?? line.categoryId,
	);
	const [costCenterId, setCostCenterId] = useState<string | null>(
		draft?.costCenterId ?? null,
	);
	const [payerId, setPayerId] = useState<string | null>(
		draft ? draft.payerId : defaultPayerId,
	);
	const [paymentMethod, setPaymentMethod] = useState(
		draft?.paymentMethod ?? "Pix",
	);
	const [condition, setCondition] = useState<"À vista" | "Parcelado">(
		draft?.condition ?? (detected ? "Parcelado" : "À vista"),
	);
	const [installmentCount, setInstallmentCount] = useState(
		String(draft?.installmentCount ?? detected?.total ?? MIN_INSTALLMENTS),
	);
	const [currentInstallment, setCurrentInstallment] = useState(
		String(draft?.startInstallment ?? detected?.current ?? 1),
	);
	// O componente é montado com `key={line.id}` no workspace, então o estado
	// inicial já reidrata do rascunho ao trocar de linha.

	const filteredCategoryOptions = categoryOptions.filter(
		(opt) =>
			opt.group === (transactionType === "Receita" ? "receita" : "despesa"),
	);

	const suggestionLabel = line.categorySource
		? categorySourceLabel[line.categorySource]
		: null;

	const isParcelado = condition === "Parcelado";
	const totalInstallments = Number(installmentCount);
	const startInstallment = Number(currentInstallment);
	const areInstallmentsValid =
		!isParcelado ||
		(Number.isInteger(totalInstallments) &&
			Number.isInteger(startInstallment) &&
			totalInstallments >= MIN_INSTALLMENTS &&
			totalInstallments <= MAX_INSTALLMENTS &&
			startInstallment >= 1 &&
			startInstallment <= totalInstallments);

	const canSave =
		areInstallmentsValid &&
		!!(isCardLine ? cardId : accountId) &&
		!!categoryId &&
		(transactionType !== "Despesa" || !!costCenterId) &&
		!!purchaseDate &&
		!!description.trim();

	const handleLinkExisting = async () => {
		if (!possibleDuplicate) return;
		setIsLinking(true);
		try {
			const result = await matchStatementLineAction({
				statementLineId: line.id,
				transactionId: possibleDuplicate.transactionId,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success("Vinculado ao lançamento existente.");
			onMatchedExisting?.();
		} finally {
			setIsLinking(false);
		}
	};

	const handleSubmit = () => {
		if (!canSave || !categoryId) return;
		if (isCardLine && !cardId) return;
		if (!isCardLine && !accountId) return;
		if (transactionType === "Despesa" && !costCenterId) return;
		onStage({
			name: description.trim(),
			transactionType,
			amount: Number(amount),
			paymentMethod: isCardLine ? "Cartão de crédito" : paymentMethod,
			condition,
			...(isParcelado
				? { installmentCount: totalInstallments, startInstallment }
				: {}),
			purchaseDate,
			accountId: isCardLine ? null : accountId,
			cardId: isCardLine ? cardId : null,
			categoryId,
			costCenterId: transactionType === "Despesa" ? costCenterId : null,
			payerId,
		});
	};

	return (
		<div className="flex flex-col gap-4">
			{possibleDuplicate && (
				<div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
					<p>
						Possível duplicata: já existe o lançamento{" "}
						<strong>{possibleDuplicate.name}</strong> (
						{formatDateOnly(possibleDuplicate.purchaseDate)},{" "}
						{formatCurrency(Math.abs(possibleDuplicate.amount))}).
					</p>
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={handleLinkExisting}
							disabled={isLinking}
						>
							{isLinking ? "Vinculando..." : "Vincular a este lançamento"}
						</Button>
						<span className="self-center text-muted-foreground text-xs">
							ou continue abaixo para criar um novo
						</span>
					</div>
				</div>
			)}
			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label>Tipo</Label>
					<Select
						value={transactionType}
						onValueChange={(v) => {
							setTransactionType(v as "Despesa" | "Receita");
							setCategoryId(null);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Despesa">Despesa</SelectItem>
							<SelectItem value="Receita">Receita</SelectItem>
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label>Valor</Label>
					<Input
						type="number"
						step="0.01"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
					/>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label>Data</Label>
					<Input
						type="date"
						value={purchaseDate}
						onChange={(e) => setPurchaseDate(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label>Forma de pagamento</Label>
					{isCardLine ? (
						<div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-muted-foreground text-sm">
							Cartão de crédito
						</div>
					) : (
						<Select value={paymentMethod} onValueChange={setPaymentMethod}>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAYMENT_METHODS.filter((m) => m !== "Cartão de crédito").map(
									(method) => (
										<SelectItem key={method} value={method}>
											{method}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
					)}
				</div>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label>Condição</Label>
					<Select
						value={condition}
						onValueChange={(v) => setCondition(v as "À vista" | "Parcelado")}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="À vista">À vista</SelectItem>
							<SelectItem value="Parcelado">Parcelado</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{isParcelado && (
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<Label>Parcela atual</Label>
							<Input
								type="number"
								inputMode="numeric"
								min={1}
								max={MAX_INSTALLMENTS}
								step={1}
								value={currentInstallment}
								onChange={(e) => setCurrentInstallment(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label>Total de parcelas</Label>
							<Input
								type="number"
								inputMode="numeric"
								min={MIN_INSTALLMENTS}
								max={MAX_INSTALLMENTS}
								step={1}
								value={installmentCount}
								onChange={(e) => setInstallmentCount(e.target.value)}
							/>
						</div>
					</div>
				)}
			</div>
			{isParcelado && areInstallmentsValid && (
				<p className="text-muted-foreground text-xs">
					O valor acima é o de cada parcela. Serão criadas as parcelas{" "}
					{startInstallment} a {totalInstallments}, uma por mês.
				</p>
			)}

			<div className="space-y-1.5">
				<Label>Descrição</Label>
				<Input
					value={description}
					onChange={(e) => setDescription(e.target.value)}
				/>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label>{isCardLine ? "Cartão *" : "Conta *"}</Label>
					{isCardLine ? (
						<Select value={cardId ?? undefined} onValueChange={setCardId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Selecione" />
							</SelectTrigger>
							<SelectContent>
								{cardOptions.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<Select value={accountId ?? undefined} onValueChange={setAccountId}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Selecione" />
							</SelectTrigger>
							<SelectContent>
								{accountOptions.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</div>
				<div className="space-y-1.5">
					<Label>Categoria *</Label>
					<Select value={categoryId ?? undefined} onValueChange={setCategoryId}>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecione" />
						</SelectTrigger>
						<SelectContent>
							{filteredCategoryOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{suggestionLabel && (
						<Badge variant="secondary" className="text-[10px]">
							{suggestionLabel}
						</Badge>
					)}
				</div>
			</div>

			{transactionType === "Despesa" && (
				<div className="space-y-1.5">
					<Label>Centro de custo *</Label>
					<Select
						value={costCenterId ?? undefined}
						onValueChange={setCostCenterId}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecione" />
						</SelectTrigger>
						<SelectContent>
							{costCenterOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}

			<div className="space-y-1.5">
				<Label>Pessoa</Label>
				<Select
					value={payerId ?? "none"}
					onValueChange={(v) => setPayerId(v === "none" ? null : v)}
				>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Nenhuma" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">Nenhuma</SelectItem>
						{payerOptions.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="mt-2 flex gap-2">
				<Button onClick={handleSubmit} disabled={!canSave} className="flex-1">
					{draft ? "Atualizar classificação" : "Classificar e avançar"}
				</Button>
				{draft && (
					<Button type="button" variant="outline" onClick={onUnstage}>
						Remover classificação
					</Button>
				)}
			</div>
			<p className="text-muted-foreground text-xs">
				O lançamento só é criado quando você clicar em "Importar classificados".
			</p>
		</div>
	);
}
