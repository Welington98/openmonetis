"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createTransactionAction } from "@/features/transactions/actions/single-actions";
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
import { toDateOnlyString } from "@/shared/utils/date";
import type { StatementLineWithCategory } from "../queries";

interface ClassifyLineFormProps {
	line: StatementLineWithCategory;
	payerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
	onDone: (transactionId: string) => void;
}

const MIN_INSTALLMENTS = 2;
const MAX_INSTALLMENTS = 60;

// Bancos costumam sufixar a descrição com "02/04" (parcela atual/total).
function detectInstallments(description: string) {
	const match = description.match(/(\d{1,2})\/(\d{1,2})\s*$/);
	if (!match) return null;
	const current = Number(match[1]);
	const total = Number(match[2]);
	if (
		total < MIN_INSTALLMENTS ||
		total > MAX_INSTALLMENTS ||
		current < 1 ||
		current > total
	) {
		return null;
	}
	return { current, total };
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
	onDone,
}: ClassifyLineFormProps) {
	const isCardLine = line.pluggyAccountType === "CREDIT";
	const [isSaving, setIsSaving] = useState(false);
	const [transactionType, setTransactionType] = useState<"Despesa" | "Receita">(
		line.type === "receita" ? "Receita" : "Despesa",
	);
	const [amount, setAmount] = useState(String(Math.abs(Number(line.amount))));
	const [description, setDescription] = useState(line.description);
	const [purchaseDate, setPurchaseDate] = useState(
		toDateOnlyString(line.date) ?? "",
	);
	const [accountId, setAccountId] = useState<string | null>(
		line.linkedFinancialAccountId,
	);
	const [cardId, setCardId] = useState<string | null>(line.linkedCardId);
	const [categoryId, setCategoryId] = useState<string | null>(line.categoryId);
	const [costCenterId, setCostCenterId] = useState<string | null>(null);
	const [payerId, setPayerId] = useState<string | null>(defaultPayerId);
	const [paymentMethod, setPaymentMethod] = useState("Pix");
	const detected = detectInstallments(line.description);
	const [condition, setCondition] = useState<"À vista" | "Parcelado">(
		detected ? "Parcelado" : "À vista",
	);
	const [installmentCount, setInstallmentCount] = useState(
		String(detected?.total ?? MIN_INSTALLMENTS),
	);
	const [currentInstallment, setCurrentInstallment] = useState(
		String(detected?.current ?? 1),
	);
	// "each": o valor é o de cada parcela (caso típico do extrato, que traz só
	// uma parcela). "total": o valor é o total da compra e será dividido.
	const [amountMode, setAmountMode] = useState<"each" | "total">(
		detected ? "each" : "total",
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset do formulário quando a linha selecionada muda
	useEffect(() => {
		setTransactionType(line.type === "receita" ? "Receita" : "Despesa");
		setAmount(String(Math.abs(Number(line.amount))));
		setDescription(line.description);
		setPurchaseDate(toDateOnlyString(line.date) ?? "");
		setAccountId(line.linkedFinancialAccountId);
		setCardId(line.linkedCardId);
		setCategoryId(line.categoryId);
		setCostCenterId(null);
		setPayerId(defaultPayerId);
		setPaymentMethod("Pix");
		const next = detectInstallments(line.description);
		setCondition(next ? "Parcelado" : "À vista");
		setInstallmentCount(String(next?.total ?? MIN_INSTALLMENTS));
		setCurrentInstallment(String(next?.current ?? 1));
		setAmountMode(next ? "each" : "total");
	}, [line.id]);

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

	const handleSubmit = async () => {
		if (!canSave || !categoryId) return;
		if (isCardLine && !cardId) return;
		if (!isCardLine && !accountId) return;
		if (transactionType === "Despesa" && !costCenterId) return;
		setIsSaving(true);
		try {
			const result = await createTransactionAction({
				name: description,
				transactionType,
				// A action divide o valor pelo total de parcelas; se o valor
				// informado é o de UMA parcela, multiplica de volta.
				amount:
					isParcelado && amountMode === "each"
						? Math.round(Number(amount) * totalInstallments * 100) / 100
						: Number(amount),
				paymentMethod: isCardLine
					? "Cartão de crédito"
					: (paymentMethod as (typeof PAYMENT_METHODS)[number]),
				condition,
				...(isParcelado
					? {
							installmentCount: totalInstallments,
							startInstallment,
						}
					: {}),
				purchaseDate,
				accountId: isCardLine ? null : accountId,
				cardId: isCardLine ? cardId : null,
				categoryId,
				costCenterId: transactionType === "Despesa" ? costCenterId : null,
				payerId,
				isSettled: true,
				isSplit: false,
				note: null,
			});

			if (!result.success || !result.data) {
				toast.error(
					!result.success ? result.error : "Falha ao criar lançamento.",
				);
				return;
			}

			toast.success("Lançamento criado.");
			onDone(result.data.ids[0]);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
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
			{isParcelado && (
				<div className="space-y-1.5">
					<Label>O valor informado é</Label>
					<Select
						value={amountMode}
						onValueChange={(v) => setAmountMode(v as "each" | "total")}
					>
						<SelectTrigger className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="each">O valor de cada parcela</SelectItem>
							<SelectItem value="total">O total a parcelar</SelectItem>
						</SelectContent>
					</Select>
					{areInstallmentsValid && (
						<p className="text-muted-foreground text-xs">
							{amountMode === "each"
								? `Serão criadas as parcelas ${startInstallment} a ${totalInstallments}, de ${formatCurrency(Number(amount) || 0)} cada, uma por mês.`
								: `${formatCurrency(Number(amount) || 0)} será dividido em ${totalInstallments} parcelas (${formatCurrency((Number(amount) || 0) / totalInstallments)} cada); serão criadas as parcelas ${startInstallment} a ${totalInstallments}, uma por mês.`}
						</p>
					)}
				</div>
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

			<Button
				onClick={handleSubmit}
				disabled={!canSave || isSaving}
				className="mt-2"
			>
				{isSaving ? "Salvando..." : "Confirmar e avançar"}
			</Button>
		</div>
	);
}
