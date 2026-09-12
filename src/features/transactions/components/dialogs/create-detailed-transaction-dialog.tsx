"use client";

import { RiAddLine, RiDeleteBin5Line, RiFileCopyLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createDetailedTransactionAction } from "@/features/transactions/actions";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { formatCurrency } from "@/shared/utils/currency";
import { getTodayDateString } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";
import {
	AccountCardSelectContent,
	PayerSelectContent,
	PaymentMethodSelectContent,
} from "../select-items";
import type { SelectOption } from "../types";

type DetailedItemType = "Despesa" | "Receita";

type ItemDraft = {
	key: string;
	name: string;
	transactionType: DetailedItemType;
	categoryId: string;
	costCenterId: string;
	amount: string;
};

type CreateDetailedTransactionDialogProps = {
	trigger?: React.ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	accountOptions: SelectOption[];
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
};

const makeKey = () =>
	`item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const NO_COST_CENTER = "__none__";
const NO_PAYER = "__none__";

const emptyItem = (): ItemDraft => ({
	key: makeKey(),
	name: "",
	transactionType: "Despesa",
	categoryId: "",
	costCenterId: NO_COST_CENTER,
	amount: "",
});

const netAmount = (items: ItemDraft[]) =>
	items.reduce((total, item) => {
		const value = Number(item.amount) || 0;
		return total + (item.transactionType === "Receita" ? value : -value);
	}, 0);

export function CreateDetailedTransactionDialog({
	trigger,
	open: controlledOpen,
	onOpenChange,
	accountOptions,
	payerOptions,
	categoryOptions,
	costCenterOptions,
}: CreateDetailedTransactionDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useControlledState(
		controlledOpen,
		false,
		onOpenChange,
	);
	const [isPending, startTransition] = useTransition();
	const [name, setName] = useState("");
	const [purchaseDate, setPurchaseDate] = useState(getTodayDateString());
	const [paymentMethod, setPaymentMethod] = useState<
		(typeof PAYMENT_METHODS)[number]
	>(PAYMENT_METHODS[0]);
	const [accountId, setAccountId] = useState(accountOptions[0]?.value ?? "");
	const [payerId, setPayerId] = useState(NO_PAYER);
	const [items, setItems] = useState<ItemDraft[]>(() => [
		emptyItem(),
		emptyItem(),
	]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const resetForm = () => {
		setName("");
		setPurchaseDate(getTodayDateString());
		setPaymentMethod(PAYMENT_METHODS[0]);
		setAccountId(accountOptions[0]?.value ?? "");
		setPayerId(NO_PAYER);
		setItems([emptyItem(), emptyItem()]);
		setErrorMessage(null);
	};

	const updateItem = (key: string, patch: Partial<ItemDraft>) => {
		setItems((prev) =>
			prev.map((item) => (item.key === key ? { ...item, ...patch } : item)),
		);
	};

	const addItem = () => {
		const last = items.at(-1);
		setItems((prev) => [
			...prev,
			{
				...emptyItem(),
				transactionType: last?.transactionType ?? "Despesa",
			},
		]);
	};

	const duplicateItem = (key: string) => {
		const source = items.find((item) => item.key === key);
		if (!source) return;
		setItems((prev) => [...prev, { ...source, key: makeKey() }]);
	};

	const removeItem = (key: string) => {
		setItems((prev) => prev.filter((item) => item.key !== key));
	};

	const itemsNet = netAmount(items);
	const canSubmit =
		items.length >= 2 &&
		Math.abs(itemsNet) >= 0.01 &&
		items.every((item) => item.name.trim() && item.categoryId && item.amount);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setErrorMessage(null);

		if (!name.trim()) {
			setErrorMessage("Informe uma descrição.");
			return;
		}
		if (!accountId) {
			setErrorMessage("Selecione a conta.");
			return;
		}

		startTransition(async () => {
			const result = await createDetailedTransactionAction({
				purchaseDate,
				name: name.trim(),
				paymentMethod,
				accountId,
				payerId: payerId === NO_PAYER ? null : payerId,
				note: null,
				items: items.map((item) => ({
					name: item.name,
					transactionType: item.transactionType,
					categoryId: item.categoryId,
					costCenterId:
						item.costCenterId === NO_COST_CENTER ? null : item.costCenterId,
					amount: Number(item.amount) || 0,
				})),
			});

			if (result.success) {
				toast.success(result.message);
				setOpen(false);
				resetForm();
				router.refresh();
				return;
			}

			setErrorMessage(result.error);
			toast.error(result.error);
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) resetForm();
			}}
		>
			{trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Lançamento detalhado</DialogTitle>
					<DialogDescription>
						Cria um único movimento na conta, subdividido em itens de Despesa
						e/ou Receita — cada um com sua categoria e centro de custo.
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="space-y-1">
							<Label htmlFor="detailed-name">Descrição</Label>
							<Input
								id="detailed-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Ex.: Pagamento do condomínio"
								required
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="detailed-date">Data</Label>
							<DatePicker
								id="detailed-date"
								value={purchaseDate}
								onChange={setPurchaseDate}
								required
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="detailed-payment-method">
								Forma de pagamento
							</Label>
							<Select
								value={paymentMethod}
								onValueChange={(value) =>
									setPaymentMethod(value as (typeof PAYMENT_METHODS)[number])
								}
							>
								<SelectTrigger id="detailed-payment-method" className="w-full">
									<SelectValue>
										<PaymentMethodSelectContent label={paymentMethod} />
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{PAYMENT_METHODS.map((method) => (
										<SelectItem key={method} value={method}>
											<PaymentMethodSelectContent label={method} />
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="detailed-account">Conta</Label>
							<Select value={accountId} onValueChange={setAccountId}>
								<SelectTrigger id="detailed-account" className="w-full">
									<SelectValue placeholder="Selecione a conta" />
								</SelectTrigger>
								<SelectContent>
									{accountOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<AccountCardSelectContent
												label={option.label}
												logo={option.logo}
											/>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1 sm:col-span-2">
							<Label htmlFor="detailed-payer">Pessoa (opcional)</Label>
							<Select value={payerId} onValueChange={setPayerId}>
								<SelectTrigger id="detailed-payer" className="w-full">
									<SelectValue placeholder="Selecione a pessoa" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_PAYER}>Sem pessoa</SelectItem>
									{payerOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<PayerSelectContent
												label={option.label}
												avatarUrl={option.avatarUrl}
											/>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<Label>Itens</Label>
						<div className="space-y-2 rounded-md border p-3">
							{items.map((item) => (
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
										<div className="grid grid-cols-3 gap-2">
											<Select
												value={item.transactionType}
												onValueChange={(value) =>
													updateItem(item.key, {
														transactionType: value as DetailedItemType,
														categoryId: "",
													})
												}
											>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Tipo" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="Despesa">Despesa</SelectItem>
													<SelectItem value="Receita">Receita</SelectItem>
												</SelectContent>
											</Select>
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
													{categoryOptions
														.filter(
															(option) =>
																option.group?.toLowerCase() ===
																item.transactionType.toLowerCase(),
														)
														.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
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
											disabled={items.length <= 2}
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

							<p
								className={cn(
									"text-xs font-medium",
									Math.abs(itemsNet) >= 0.01
										? itemsNet >= 0
											? "text-success"
											: "text-destructive"
										: "text-muted-foreground",
								)}
							>
								Total líquido do lançamento: {formatCurrency(itemsNet)}
								{itemsNet >= 0 ? " (Receita)" : " (Despesa)"}
							</p>
						</div>
					</div>

					{errorMessage && (
						<p className="text-sm text-destructive">{errorMessage}</p>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending || !canSubmit}>
							{isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
