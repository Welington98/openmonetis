"use client";

import { RiAddLine, RiDeleteBin5Line, RiFileCopyLine } from "@remixicon/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	detailTransactionAction,
	ungroupTransactionAction,
} from "@/features/transactions/actions";
import {
	transactionItemsQueryKey,
	useTransactionItems,
} from "@/features/transactions/hooks/use-transaction-items";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
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
import { cn } from "@/shared/utils/ui";
import type { SelectOption } from "../../types";

type DetailItemDraft = {
	key: string;
	name: string;
	categoryId: string;
	costCenterId: string;
	amount: string;
};

type DetailItemsSectionProps = {
	transactionId: string;
	isItemized: boolean;
	totalAmount: number;
	defaultName: string;
	defaultCategoryId: string;
	defaultCostCenterId: string;
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
};

const makeKey = () =>
	`item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const NO_COST_CENTER = "__none__";

export function DetailItemsSection({
	transactionId,
	isItemized,
	totalAmount,
	defaultName,
	defaultCategoryId,
	defaultCostCenterId,
	categoryOptions,
	costCenterOptions,
}: DetailItemsSectionProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const [isEditing, setIsEditing] = useState(false);
	const [draftItems, setDraftItems] = useState<DetailItemDraft[]>([]);
	const [isPending, startTransition] = useTransition();

	const { data: existingItems, isLoading } = useTransactionItems(
		transactionId,
		isItemized,
	);

	useEffect(() => {
		if (isItemized && existingItems && !isEditing) {
			setDraftItems(
				existingItems.map((item) => ({
					key: item.id,
					name: item.name,
					categoryId: item.categoryId,
					costCenterId: item.costCenterId ?? NO_COST_CENTER,
					amount: item.amount.toFixed(2),
				})),
			);
		}
	}, [isItemized, existingItems, isEditing]);

	const startDetailing = () => {
		setDraftItems([
			{
				key: makeKey(),
				name: defaultName,
				categoryId: defaultCategoryId,
				costCenterId: defaultCostCenterId || NO_COST_CENTER,
				amount: totalAmount.toFixed(2),
			},
		]);
		setIsEditing(true);
	};

	const addItem = () => {
		const last = draftItems.at(-1);
		setDraftItems((prev) => [
			...prev,
			{
				key: makeKey(),
				name: last?.name ?? defaultName,
				categoryId: last?.categoryId ?? defaultCategoryId,
				costCenterId: last?.costCenterId ?? NO_COST_CENTER,
				amount: "",
			},
		]);
		setIsEditing(true);
	};

	const duplicateItem = (key: string) => {
		const source = draftItems.find((item) => item.key === key);
		if (!source) return;
		setDraftItems((prev) => [...prev, { ...source, key: makeKey() }]);
		setIsEditing(true);
	};

	const removeItem = (key: string) => {
		setDraftItems((prev) => prev.filter((item) => item.key !== key));
		setIsEditing(true);
	};

	const updateItem = (key: string, patch: Partial<DetailItemDraft>) => {
		setDraftItems((prev) =>
			prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
		);
		setIsEditing(true);
	};

	const cancelEditing = () => {
		setIsEditing(false);
		if (isItemized && existingItems) {
			setDraftItems(
				existingItems.map((item) => ({
					key: item.id,
					name: item.name,
					categoryId: item.categoryId,
					costCenterId: item.costCenterId ?? NO_COST_CENTER,
					amount: item.amount.toFixed(2),
				})),
			);
		} else {
			setDraftItems([]);
		}
	};

	const itemsSum = draftItems.reduce(
		(total, item) => total + (Number(item.amount) || 0),
		0,
	);
	const sumMatches = Math.abs(itemsSum - totalAmount) < 0.01;
	const canSave = draftItems.length >= 2 && sumMatches;

	const handleSave = () => {
		startTransition(async () => {
			const result = await detailTransactionAction({
				id: transactionId,
				items: draftItems.map((item) => ({
					name: item.name,
					categoryId: item.categoryId,
					costCenterId:
						item.costCenterId === NO_COST_CENTER ? null : item.costCenterId,
					amount: Number(item.amount) || 0,
				})),
			});

			if (result.success) {
				toast.success(result.message);
				setIsEditing(false);
				void queryClient.invalidateQueries({
					queryKey: transactionItemsQueryKey(transactionId),
				});
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const handleUngroup = () => {
		startTransition(async () => {
			const result = await ungroupTransactionAction({ id: transactionId });

			if (result.success) {
				toast.success(result.message);
				setIsEditing(false);
				setDraftItems([]);
				void queryClient.invalidateQueries({
					queryKey: transactionItemsQueryKey(transactionId),
				});
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	if (!isItemized && draftItems.length === 0) {
		return (
			<div className="space-y-1">
				<Label>Detalhes do lançamento</Label>
				<button
					type="button"
					className="text-sm text-primary underline-offset-2 hover:underline"
					onClick={startDetailing}
				>
					Incluir detalhes
				</button>
				<p className="text-xs text-muted-foreground">
					Divida o valor total em itens com categoria e centro de custo próprios
					— útil pra separar principal e juros de atraso, por exemplo.
				</p>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="space-y-1">
				<Label>Detalhes do lançamento</Label>
				<p className="text-xs text-muted-foreground">Carregando...</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<Label>Detalhes do lançamento</Label>

			<div className="space-y-2 rounded-md border p-3">
				{draftItems.map((item) => (
					<div
						key={item.key}
						className="flex flex-col gap-2 border-b pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-end"
					>
						<div className="flex-1 space-y-1">
							<Input
								value={item.name}
								onChange={(event) =>
									updateItem(item.key, { name: event.target.value })
								}
								placeholder="Descrição do item"
							/>
							<div className="grid grid-cols-2 gap-2">
								<Select
									value={item.categoryId}
									onValueChange={(value) =>
										updateItem(item.key, { categoryId: value })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Categoria" />
									</SelectTrigger>
									<SelectContent>
										{categoryOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Select
									value={item.costCenterId}
									onValueChange={(value) =>
										updateItem(item.key, { costCenterId: value })
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Centro de custo" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NO_COST_CENTER}>
											Sem centro de custo
										</SelectItem>
										{costCenterOptions.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
						<div className="flex items-end gap-1 sm:w-40">
							<CurrencyInput
								value={item.amount}
								onValueChange={(value) =>
									updateItem(item.key, { amount: value })
								}
								placeholder="R$ 0,00"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => duplicateItem(item.key)}
								aria-label="Duplicar item"
							>
								<RiFileCopyLine className="size-4" />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={() => removeItem(item.key)}
								aria-label="Remover item"
							>
								<RiDeleteBin5Line className="size-4" />
							</Button>
						</div>
					</div>
				))}

				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={addItem}
					className="gap-1"
				>
					<RiAddLine className="size-4" />
					Adicionar item
				</Button>

				<div className="flex items-center justify-between text-xs">
					<span
						className={cn(
							"font-medium",
							sumMatches ? "text-success" : "text-destructive",
						)}
					>
						Soma dos itens: {formatCurrency(itemsSum)} / total:{" "}
						{formatCurrency(totalAmount)}
					</span>
				</div>

				<div className="flex justify-end gap-2">
					{isItemized ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleUngroup}
							disabled={isPending}
						>
							Desagrupar
						</Button>
					) : (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={cancelEditing}
							disabled={isPending}
						>
							Cancelar
						</Button>
					)}
					<Button
						type="button"
						size="sm"
						onClick={handleSave}
						disabled={isPending || !canSave}
					>
						{isPending ? "Salvando..." : "Salvar detalhes"}
					</Button>
				</div>
			</div>
		</div>
	);
}
