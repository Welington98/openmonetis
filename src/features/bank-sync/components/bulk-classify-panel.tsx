"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
	type BulkClassifySummary,
	bulkClassifyStatementLinesAction,
} from "@/features/bank-sync/actions";
import type { StatementLineWithCategory } from "@/features/bank-sync/queries";
import type { SelectOption } from "@/features/transactions/components/types";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatCurrency } from "@/shared/utils/currency";

const KEEP_VALUE = "__keep__";

interface BulkClassifyPanelProps {
	selectedLines: StatementLineWithCategory[];
	payerOptions: SelectOption[];
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
	onDone: (summary: BulkClassifySummary) => void;
	onCancel: () => void;
}

export function BulkClassifyPanel({
	selectedLines,
	payerOptions,
	accountOptions,
	cardOptions,
	categoryOptions,
	costCenterOptions,
	onDone,
	onCancel,
}: BulkClassifyPanelProps) {
	const [isSaving, setIsSaving] = useState(false);
	const [categoryId, setCategoryId] = useState<string | null>(null);
	const [costCenterId, setCostCenterId] = useState<string | null>(null);
	const [accountId, setAccountId] = useState<string | null>(null);
	const [cardId, setCardId] = useState<string | null>(null);
	const [payerId, setPayerId] = useState<string | null>(null);
	const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

	const hasCardLines = selectedLines.some(
		(line) => line.pluggyAccountType === "CREDIT",
	);
	const hasBankLines = selectedLines.some(
		(line) => line.pluggyAccountType !== "CREDIT",
	);

	const total = selectedLines.reduce(
		(sum, line) => sum + Math.abs(Number(line.amount)),
		0,
	);

	const handleSubmit = async () => {
		setIsSaving(true);
		try {
			const result = await bulkClassifyStatementLinesAction({
				statementLineIds: selectedLines.map((line) => line.id),
				categoryId,
				costCenterId,
				accountId,
				cardId,
				payerId,
				paymentMethod: paymentMethod ?? undefined,
			});

			if (!result.success || !result.data) {
				toast.error(
					!result.success ? result.error : "Falha ao conciliar em massa.",
				);
				return;
			}

			toast.success(result.message);
			onDone(result.data);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<div>
					<p className="font-medium">
						{selectedLines.length} lançamento(s) selecionado(s)
					</p>
					<p className="text-muted-foreground text-xs">
						Total: {formatCurrency(total)}
					</p>
				</div>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Cancelar seleção
				</Button>
			</div>

			<p className="text-muted-foreground text-xs">
				Preencha só os campos que devem valer para todos os selecionados. O que
				ficar em branco mantém o que cada linha já tinha (categoria sugerida,
				conta vinculada pelo Pluggy).
			</p>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label>Categoria</Label>
					<Select
						value={categoryId ?? KEEP_VALUE}
						onValueChange={(v) => setCategoryId(v === KEEP_VALUE ? null : v)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Manter sugerida" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={KEEP_VALUE}>Manter sugerida</SelectItem>
							{categoryOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label>Centro de custo</Label>
					<Select
						value={costCenterId ?? KEEP_VALUE}
						onValueChange={(v) => setCostCenterId(v === KEEP_VALUE ? null : v)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Manter em branco" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={KEEP_VALUE}>Manter em branco</SelectItem>
							{costCenterOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-muted-foreground text-xs">
						Obrigatório para despesas — linhas de despesa sem centro de custo
						selecionado são ignoradas.
					</p>
				</div>
				{hasBankLines && (
					<div className="space-y-1.5">
						<Label>Conta</Label>
						<Select
							value={accountId ?? KEEP_VALUE}
							onValueChange={(v) => setAccountId(v === KEEP_VALUE ? null : v)}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Manter vinculada" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={KEEP_VALUE}>Manter vinculada</SelectItem>
								{accountOptions.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
				{hasCardLines && (
					<div className="space-y-1.5">
						<Label>Cartão</Label>
						<Select
							value={cardId ?? KEEP_VALUE}
							onValueChange={(v) => setCardId(v === KEEP_VALUE ? null : v)}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Manter vinculado" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={KEEP_VALUE}>Manter vinculado</SelectItem>
								{cardOptions.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										{opt.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
			</div>

			<div className="grid grid-cols-2 gap-4">
				<div className="space-y-1.5">
					<Label>Pessoa</Label>
					<Select
						value={payerId ?? KEEP_VALUE}
						onValueChange={(v) => setPayerId(v === KEEP_VALUE ? null : v)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Manter padrão" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={KEEP_VALUE}>Manter padrão</SelectItem>
							{payerOptions.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{hasBankLines && (
					<div className="space-y-1.5">
						<Label>Forma de pagamento</Label>
						<Select
							value={paymentMethod ?? KEEP_VALUE}
							onValueChange={(v) =>
								setPaymentMethod(v === KEEP_VALUE ? null : v)
							}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Pix" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={KEEP_VALUE}>Pix (padrão)</SelectItem>
								{PAYMENT_METHODS.filter((m) => m !== "Cartão de crédito").map(
									(method) => (
										<SelectItem key={method} value={method}>
											{method}
										</SelectItem>
									),
								)}
							</SelectContent>
						</Select>
						{hasCardLines && (
							<p className="text-muted-foreground text-xs">
								Vale só pras linhas de conta — as de cartão usam "Cartão de
								crédito" automaticamente.
							</p>
						)}
					</div>
				)}
			</div>

			<Button onClick={handleSubmit} disabled={isSaving} className="mt-2">
				{isSaving
					? "Conciliando..."
					: `Conciliar ${selectedLines.length} selecionado(s)`}
			</Button>
		</div>
	);
}
