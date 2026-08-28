"use client";

import { RiLink, RiLinkUnlinkM } from "@remixicon/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	fetchPluggyCardsForConnectionAction,
	linkPluggyCardAction,
	type PluggyCardLinkRow,
} from "@/features/bank-sync/actions";
import type { BankConnectionOption } from "@/features/bank-sync/components/link-account-to-pluggy-dialog";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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

interface LinkCardToPluggyDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	cardId: string;
	cardName: string;
	currentConnectorName: string | null;
	connections: BankConnectionOption[];
}

export function LinkCardToPluggyDialog({
	open,
	onOpenChange,
	cardId,
	cardName,
	currentConnectorName,
	connections,
}: LinkCardToPluggyDialogProps) {
	const [selectedConnectionId, setSelectedConnectionId] = useState<
		string | null
	>(connections[0]?.id ?? null);
	const [isLoading, setIsLoading] = useState(false);
	const [pluggyCards, setPluggyCards] = useState<PluggyCardLinkRow[]>([]);
	const [savingPluggyAccountId, setSavingPluggyAccountId] = useState<
		string | null
	>(null);

	useEffect(() => {
		if (!open || !selectedConnectionId) return;
		setIsLoading(true);
		fetchPluggyCardsForConnectionAction({
			connectionId: selectedConnectionId,
		})
			.then((result) => {
				if (result.success && result.data) {
					setPluggyCards(result.data.cards);
				} else if (!result.success) {
					toast.error(result.error);
				}
			})
			.finally(() => setIsLoading(false));
	}, [open, selectedConnectionId]);

	const handleLink = async (pluggyAccountId: string) => {
		if (!selectedConnectionId) return;
		setSavingPluggyAccountId(pluggyAccountId);
		try {
			const result = await linkPluggyCardAction({
				connectionId: selectedConnectionId,
				pluggyAccountId,
				cardId,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			onOpenChange(false);
		} finally {
			setSavingPluggyAccountId(null);
		}
	};

	const handleUnlink = async () => {
		if (!selectedConnectionId) return;
		const linked = pluggyCards.find((c) => c.linkedCardId === cardId);
		if (!linked) return;
		setSavingPluggyAccountId(linked.pluggyAccountId);
		try {
			const result = await linkPluggyCardAction({
				connectionId: selectedConnectionId,
				pluggyAccountId: linked.pluggyAccountId,
				cardId: null,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			onOpenChange(false);
		} finally {
			setSavingPluggyAccountId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Vincular ao Pluggy — {cardName}</DialogTitle>
					<DialogDescription>
						Escolha qual cartão trazido pelo Pluggy corresponde a "{cardName}".
						As transações sincronizadas desse cartão vão vir com esse destino
						pré-selecionado na conciliação.
					</DialogDescription>
				</DialogHeader>

				{currentConnectorName && (
					<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm">
						<span>
							Vinculado hoje a <strong>{currentConnectorName}</strong>.
						</span>
						<Button
							variant="ghost"
							size="sm"
							onClick={handleUnlink}
							disabled={savingPluggyAccountId !== null}
						>
							<RiLinkUnlinkM className="size-4" />
							Desvincular
						</Button>
					</div>
				)}

				{connections.length > 1 && (
					<Select
						value={selectedConnectionId ?? undefined}
						onValueChange={setSelectedConnectionId}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecione a conexão bancária" />
						</SelectTrigger>
						<SelectContent>
							{connections.map((connection) => (
								<SelectItem key={connection.id} value={connection.id}>
									{connection.connectorName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}

				<div className="flex flex-col gap-2">
					{isLoading ? (
						<>
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-14 w-full" />
						</>
					) : pluggyCards.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhum cartão de crédito encontrado nessa conexão.
						</p>
					) : (
						pluggyCards.map((card) => {
							const isLinkedHere = card.linkedCardId === cardId;
							const isLinkedElsewhere = !!card.linkedCardId && !isLinkedHere;

							return (
								<div
									key={card.pluggyAccountId}
									className="flex items-center justify-between gap-3 rounded-md border p-3"
								>
									<div className="flex flex-col">
										<span className="font-medium text-sm">{card.name}</span>
										<span className="text-muted-foreground text-xs">
											Fatura atual no Pluggy: {formatCurrency(card.balance)}
											{isLinkedElsewhere && " · já vinculado a outro cartão"}
										</span>
									</div>
									<Button
										size="sm"
										variant={isLinkedHere ? "secondary" : "outline"}
										disabled={
											isLinkedHere ||
											savingPluggyAccountId === card.pluggyAccountId
										}
										onClick={() => handleLink(card.pluggyAccountId)}
									>
										<RiLink className="size-4" />
										{isLinkedHere ? "Vinculado" : "Vincular"}
									</Button>
								</div>
							);
						})
					)}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
