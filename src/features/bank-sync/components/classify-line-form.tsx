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
import { toDateOnlyString } from "@/shared/utils/date";
import type { StatementLineWithCategory } from "../queries";

interface ClassifyLineFormProps {
	line: StatementLineWithCategory;
	payerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	onDone: (transactionId: string) => void;
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
	const [payerId, setPayerId] = useState<string | null>(defaultPayerId);
	const [paymentMethod, setPaymentMethod] = useState("Pix");

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset do formulário quando a linha selecionada muda
	useEffect(() => {
		setTransactionType(line.type === "receita" ? "Receita" : "Despesa");
		setAmount(String(Math.abs(Number(line.amount))));
		setDescription(line.description);
		setPurchaseDate(toDateOnlyString(line.date) ?? "");
		setAccountId(line.linkedFinancialAccountId);
		setCardId(line.linkedCardId);
		setCategoryId(line.categoryId);
		setPayerId(defaultPayerId);
		setPaymentMethod("Pix");
	}, [line.id]);

	const filteredCategoryOptions = categoryOptions.filter(
		(opt) =>
			opt.group === (transactionType === "Receita" ? "receita" : "despesa"),
	);

	const suggestionLabel = line.categorySource
		? categorySourceLabel[line.categorySource]
		: null;

	const canSave =
		!!(isCardLine ? cardId : accountId) &&
		!!categoryId &&
		!!purchaseDate &&
		!!description.trim();

	const handleSubmit = async () => {
		if (!canSave || !categoryId) return;
		if (isCardLine && !cardId) return;
		if (!isCardLine && !accountId) return;
		setIsSaving(true);
		try {
			const result = await createTransactionAction({
				name: description,
				transactionType,
				amount: Number(amount),
				paymentMethod: isCardLine
					? "Cartão de crédito"
					: (paymentMethod as (typeof PAYMENT_METHODS)[number]),
				condition: "À vista",
				purchaseDate,
				accountId: isCardLine ? null : accountId,
				cardId: isCardLine ? cardId : null,
				categoryId,
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
