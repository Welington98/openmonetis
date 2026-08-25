"use client";

import { RiLink, RiLinkUnlinkM } from "@remixicon/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	fetchPluggyAccountsForConnectionAction,
	linkPluggyAccountAction,
	type PluggyAccountLinkRow,
} from "@/features/bank-sync/actions";
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

export type BankConnectionOption = { id: string; connectorName: string };

interface LinkAccountToPluggyDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	financialAccountId: string;
	financialAccountName: string;
	currentConnectorName: string | null;
	connections: BankConnectionOption[];
}

export function LinkAccountToPluggyDialog({
	open,
	onOpenChange,
	financialAccountId,
	financialAccountName,
	currentConnectorName,
	connections,
}: LinkAccountToPluggyDialogProps) {
	const [selectedConnectionId, setSelectedConnectionId] = useState<
		string | null
	>(connections[0]?.id ?? null);
	const [isLoading, setIsLoading] = useState(false);
	const [pluggyAccounts, setPluggyAccounts] = useState<PluggyAccountLinkRow[]>(
		[],
	);
	const [savingPluggyAccountId, setSavingPluggyAccountId] = useState<
		string | null
	>(null);

	useEffect(() => {
		if (!open || !selectedConnectionId) return;
		setIsLoading(true);
		fetchPluggyAccountsForConnectionAction({
			connectionId: selectedConnectionId,
		})
			.then((result) => {
				if (result.success && result.data) {
					setPluggyAccounts(result.data.accounts);
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
			const result = await linkPluggyAccountAction({
				connectionId: selectedConnectionId,
				pluggyAccountId,
				financialAccountId,
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
		const linked = pluggyAccounts.find(
			(a) => a.linkedFinancialAccountId === financialAccountId,
		);
		if (!linked) return;
		setSavingPluggyAccountId(linked.pluggyAccountId);
		try {
			const result = await linkPluggyAccountAction({
				connectionId: selectedConnectionId,
				pluggyAccountId: linked.pluggyAccountId,
				financialAccountId: null,
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
					<DialogTitle>Vincular ao Pluggy — {financialAccountName}</DialogTitle>
					<DialogDescription>
						Escolha qual conta trazida pelo Pluggy corresponde a "
						{financialAccountName}". As transações sincronizadas dessa conta vão
						vir com esse destino pré-selecionado na conciliação.
					</DialogDescription>
				</DialogHeader>

				{currentConnectorName && (
					<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3 text-sm">
						<span>
							Vinculada hoje a <strong>{currentConnectorName}</strong>.
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
					) : pluggyAccounts.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma conta bancária encontrada nessa conexão.
						</p>
					) : (
						pluggyAccounts.map((account) => {
							const isLinkedHere =
								account.linkedFinancialAccountId === financialAccountId;
							const isLinkedElsewhere =
								!!account.linkedFinancialAccountId && !isLinkedHere;

							return (
								<div
									key={account.pluggyAccountId}
									className="flex items-center justify-between gap-3 rounded-md border p-3"
								>
									<div className="flex flex-col">
										<span className="font-medium text-sm">{account.name}</span>
										<span className="text-muted-foreground text-xs">
											Saldo no Pluggy: {formatCurrency(account.balance)}
											{isLinkedElsewhere && " · já vinculada a outra conta"}
										</span>
									</div>
									<Button
										size="sm"
										variant={isLinkedHere ? "secondary" : "outline"}
										disabled={
											isLinkedHere ||
											savingPluggyAccountId === account.pluggyAccountId
										}
										onClick={() => handleLink(account.pluggyAccountId)}
									>
										<RiLink className="size-4" />
										{isLinkedHere ? "Vinculada" : "Vincular"}
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
