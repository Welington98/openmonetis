"use client";

import { RiLink } from "@remixicon/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	fetchPluggyCardsForConnectionAction,
	linkPluggyCardAction,
	type PluggyCardLinkRow,
} from "@/features/bank-sync/actions";
import type { SelectOption } from "@/features/transactions/components/types";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/shared/utils/currency";

const UNLINKED_VALUE = "__unlinked__";

interface LinkCardsDialogProps {
	connectionId: string;
	connectorName: string;
	cardOptions: SelectOption[];
}

export function LinkCardsDialog({
	connectionId,
	connectorName,
	cardOptions,
}: LinkCardsDialogProps) {
	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [cards, setCards] = useState<PluggyCardLinkRow[]>([]);
	const [savingId, setSavingId] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setIsLoading(true);
		fetchPluggyCardsForConnectionAction({ connectionId })
			.then((result) => {
				if (result.success && result.data) {
					setCards(result.data.cards);
				} else if (!result.success) {
					toast.error(result.error);
				}
			})
			.finally(() => setIsLoading(false));
	}, [open, connectionId]);

	const handleChange = async (pluggyAccountId: string, cardId: string) => {
		setSavingId(pluggyAccountId);
		try {
			const result = await linkPluggyCardAction({
				connectionId,
				pluggyAccountId,
				cardId: cardId === UNLINKED_VALUE ? null : cardId,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setCards((prev) =>
				prev.map((card) =>
					card.pluggyAccountId === pluggyAccountId
						? {
								...card,
								linkedCardId: cardId === UNLINKED_VALUE ? null : cardId,
							}
						: card,
				),
			);
		} finally {
			setSavingId(null);
		}
	};

	if (cardOptions.length === 0) return null;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<RiLink className="size-4" />
					Vincular cartões
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Vincular cartões — {connectorName}</DialogTitle>
					<DialogDescription>
						Escolha qual cartão cadastrado corresponde a cada cartão de crédito
						trazido pelo Pluggy. As transações sincronizadas desse cartão já vêm
						com esse destino pré-selecionado na revisão.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					{isLoading ? (
						<>
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-14 w-full" />
						</>
					) : cards.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhum cartão de crédito encontrado nessa conexão.
						</p>
					) : (
						cards.map((card) => (
							<div
								key={card.pluggyAccountId}
								className="flex items-center justify-between gap-4 rounded-md border p-3"
							>
								<div className="flex flex-col">
									<span className="font-medium text-sm">{card.name}</span>
									<span className="text-muted-foreground text-xs">
										Fatura atual no Pluggy: {formatCurrency(card.balance)}
									</span>
								</div>
								<Select
									value={card.linkedCardId ?? UNLINKED_VALUE}
									onValueChange={(value) =>
										handleChange(card.pluggyAccountId, value)
									}
									disabled={savingId === card.pluggyAccountId}
								>
									<SelectTrigger className="w-48">
										<SelectValue placeholder="Não vincular" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={UNLINKED_VALUE}>Não vincular</SelectItem>
										{cardOptions.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						))
					)}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
