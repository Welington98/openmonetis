"use client";

import { RiBankLine, RiCloseLine, RiRefreshLine } from "@remixicon/react";
import { useState } from "react";
import { toast } from "sonner";
import {
	deleteBankConnectionAction,
	ignoreStatementLineAction,
	markStatementLineMatchedAction,
	triggerManualSyncAction,
} from "@/features/bank-sync/actions";
import { ConnectBankButton } from "@/features/bank-sync/components/connect-bank-button";
import type { StatementLineWithCategory } from "@/features/bank-sync/queries";
import { TransactionDialog } from "@/features/transactions/components/dialogs/transaction-dialog/transaction-dialog";
import type { SelectOption } from "@/features/transactions/components/types";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

type BankConnectionRow = {
	id: string;
	connectorName: string;
	status: string;
	isActive: boolean;
	lastSyncedAt: Date | null;
};

interface BankSyncPageProps {
	pluggyConfigured: boolean;
	connections: BankConnectionRow[];
	statementLines: StatementLineWithCategory[];
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
}

export function BankSyncPage({
	pluggyConfigured,
	connections,
	statementLines,
	payerOptions,
	splitPayerOptions,
	defaultPayerId,
	accountOptions,
	cardOptions,
	categoryOptions,
}: BankSyncPageProps) {
	const [syncingId, setSyncingId] = useState<string | null>(null);
	const [connectionToDelete, setConnectionToDelete] =
		useState<BankConnectionRow | null>(null);
	const [lineToIgnore, setLineToIgnore] =
		useState<StatementLineWithCategory | null>(null);
	const [lineToCreate, setLineToCreate] =
		useState<StatementLineWithCategory | null>(null);

	const handleSync = async (connectionId: string) => {
		setSyncingId(connectionId);
		try {
			const result = await triggerManualSyncAction({ connectionId });
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		} finally {
			setSyncingId(null);
		}
	};

	const handleDeleteConfirm = async () => {
		if (!connectionToDelete) return;
		const result = await deleteBankConnectionAction({
			connectionId: connectionToDelete.id,
		});
		if (result.success) {
			toast.success(result.message);
			return;
		}
		toast.error(result.error);
		throw new Error(result.error);
	};

	const handleIgnoreConfirm = async () => {
		if (!lineToIgnore) return;
		const result = await ignoreStatementLineAction({
			statementLineId: lineToIgnore.id,
		});
		if (result.success) {
			toast.success(result.message);
			return;
		}
		toast.error(result.error);
		throw new Error(result.error);
	};

	const handleTransactionSuccess = async () => {
		if (!lineToCreate) return;
		const result = await markStatementLineMatchedAction({
			statementLineId: lineToCreate.id,
		});
		if (!result.success) toast.error(result.error);
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-xl">Sincronização bancária</h1>
					<p className="text-muted-foreground text-sm">
						Conecte suas contas via Open Finance (Pluggy) e revise as transações
						importadas antes de virarem lançamentos.
					</p>
				</div>
				<ConnectBankButton pluggyConfigured={pluggyConfigured} />
			</div>

			<section className="flex flex-col gap-3">
				<h2 className="font-medium text-sm text-muted-foreground">Conexões</h2>
				{connections.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<RiBankLine />
							</EmptyMedia>
							<EmptyTitle>Nenhuma conexão bancária</EmptyTitle>
							<EmptyDescription>
								Conecte um banco para sincronizar transações automaticamente.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{connections.map((connection) => (
							<Card key={connection.id}>
								<CardHeader className="flex-row items-center justify-between">
									<CardTitle className="text-base">
										{connection.connectorName}
									</CardTitle>
									<Badge
										variant={connection.isActive ? "default" : "secondary"}
									>
										{connection.status}
									</Badge>
								</CardHeader>
								<CardContent className="flex flex-col gap-3">
									<p className="text-muted-foreground text-xs">
										Última sincronização:{" "}
										{connection.lastSyncedAt
											? formatDateOnly(connection.lastSyncedAt)
											: "nunca"}
									</p>
									<div className="flex gap-2">
										<Button
											variant="outline"
											size="sm"
											disabled={syncingId === connection.id}
											onClick={() => handleSync(connection.id)}
										>
											<RiRefreshLine className="size-4" />
											Sincronizar
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setConnectionToDelete(connection)}
										>
											<RiCloseLine className="size-4" />
											Remover
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="font-medium text-sm text-muted-foreground">
					Transações pendentes de revisão ({statementLines.length})
				</h2>
				{statementLines.length === 0 ? (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Tudo revisado</EmptyTitle>
							<EmptyDescription>
								Nenhuma transação sincronizada aguardando revisão no momento.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="flex flex-col gap-2">
						{statementLines.map((line) => (
							<Card key={line.id}>
								<CardContent className="flex items-center justify-between gap-4 py-3">
									<div className="flex flex-col">
										<span className="font-medium text-sm">
											{line.description}
										</span>
										<span className="text-muted-foreground text-xs">
											{formatDateOnly(line.date)} ·{" "}
											{line.type === "despesa" ? "Despesa" : "Receita"}
										</span>
									</div>
									<div className="flex items-center gap-3">
										<span className="font-medium text-sm">
											{formatCurrency(Number(line.amount))}
										</span>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setLineToCreate(line)}
										>
											Criar lançamento
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setLineToIgnore(line)}
										>
											Ignorar
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</section>

			<TransactionDialog
				mode="create"
				open={Boolean(lineToCreate)}
				onOpenChange={(open) => !open && setLineToCreate(null)}
				payerOptions={payerOptions}
				splitPayerOptions={splitPayerOptions}
				defaultPayerId={defaultPayerId}
				accountOptions={accountOptions}
				cardOptions={cardOptions}
				categoryOptions={categoryOptions}
				estabelecimentos={[]}
				defaultPurchaseDate={
					lineToCreate?.date.toISOString().slice(0, 10) ?? null
				}
				defaultName={lineToCreate?.description ?? null}
				defaultAmount={
					lineToCreate ? String(Math.abs(Number(lineToCreate.amount))) : null
				}
				defaultTransactionType={
					lineToCreate?.type === "receita" ? "Receita" : "Despesa"
				}
				forceShowTransactionType
				onSuccess={handleTransactionSuccess}
			/>

			<ConfirmActionDialog
				open={Boolean(connectionToDelete)}
				onOpenChange={(open) => !open && setConnectionToDelete(null)}
				title="Remover conexão bancária?"
				description="A conexão será removida e as contas vinculadas deixarão de sincronizar automaticamente."
				confirmLabel="Remover"
				confirmVariant="destructive"
				pendingLabel="Removendo..."
				onConfirm={handleDeleteConfirm}
			/>

			<ConfirmActionDialog
				open={Boolean(lineToIgnore)}
				onOpenChange={(open) => !open && setLineToIgnore(null)}
				title="Ignorar transação?"
				description="A transação sincronizada será ignorada e não aparecerá mais na lista de revisão."
				confirmLabel="Ignorar"
				confirmVariant="destructive"
				pendingLabel="Ignorando..."
				onConfirm={handleIgnoreConfirm}
			/>
		</div>
	);
}
