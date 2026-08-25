"use client";

import { RiLink } from "@remixicon/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	fetchPluggyAccountsForConnectionAction,
	linkPluggyAccountAction,
	type PluggyAccountLinkRow,
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

interface LinkAccountsDialogProps {
	connectionId: string;
	connectorName: string;
	accountOptions: SelectOption[];
}

export function LinkAccountsDialog({
	connectionId,
	connectorName,
	accountOptions,
}: LinkAccountsDialogProps) {
	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [accounts, setAccounts] = useState<PluggyAccountLinkRow[]>([]);
	const [savingId, setSavingId] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setIsLoading(true);
		fetchPluggyAccountsForConnectionAction({ connectionId })
			.then((result) => {
				if (result.success && result.data) {
					setAccounts(result.data.accounts);
				} else if (!result.success) {
					toast.error(result.error);
				}
			})
			.finally(() => setIsLoading(false));
	}, [open, connectionId]);

	const handleChange = async (
		pluggyAccountId: string,
		financialAccountId: string,
	) => {
		setSavingId(pluggyAccountId);
		try {
			const result = await linkPluggyAccountAction({
				connectionId,
				pluggyAccountId,
				financialAccountId:
					financialAccountId === UNLINKED_VALUE ? null : financialAccountId,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setAccounts((prev) =>
				prev.map((account) =>
					account.pluggyAccountId === pluggyAccountId
						? {
								...account,
								linkedFinancialAccountId:
									financialAccountId === UNLINKED_VALUE
										? null
										: financialAccountId,
							}
						: account,
				),
			);
		} finally {
			setSavingId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<RiLink className="size-4" />
					Vincular contas
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Vincular contas — {connectorName}</DialogTitle>
					<DialogDescription>
						Escolha qual conta cadastrada corresponde a cada conta trazida pelo
						Pluggy. As transações sincronizadas dessa conta já vêm com esse
						destino pré-selecionado na revisão.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					{isLoading ? (
						<>
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-14 w-full" />
						</>
					) : accounts.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma conta bancária encontrada nessa conexão.
						</p>
					) : (
						accounts.map((account) => (
							<div
								key={account.pluggyAccountId}
								className="flex items-center justify-between gap-4 rounded-md border p-3"
							>
								<div className="flex flex-col">
									<span className="font-medium text-sm">{account.name}</span>
									<span className="text-muted-foreground text-xs">
										Saldo no Pluggy: {formatCurrency(account.balance)}
									</span>
								</div>
								<Select
									value={account.linkedFinancialAccountId ?? UNLINKED_VALUE}
									onValueChange={(value) =>
										handleChange(account.pluggyAccountId, value)
									}
									disabled={savingId === account.pluggyAccountId}
								>
									<SelectTrigger className="w-48">
										<SelectValue placeholder="Não vincular" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={UNLINKED_VALUE}>Não vincular</SelectItem>
										{accountOptions.map((opt) => (
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
