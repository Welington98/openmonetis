"use client";

import {
	RiBankLine,
	RiCheckLine,
	RiCloseLine,
	RiDownload2Line,
	RiRefreshLine,
	RiSparklingLine,
} from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	backfillStatementLineAccountsAction,
	bulkImportStatementLinesAction,
	deleteBankConnectionAction,
	ignoreStatementLineAction,
	suggestCategoriesForPendingLinesAction,
	triggerManualSyncAction,
} from "@/features/bank-sync/actions";
import { ClassifyLineForm } from "@/features/bank-sync/components/classify-line-form";
import { ConnectBankButton } from "@/features/bank-sync/components/connect-bank-button";
import { LinkAccountsDialog } from "@/features/bank-sync/components/link-accounts-dialog";
import { MatchExistingTab } from "@/features/bank-sync/components/match-existing-tab";
import type {
	ReconciliationWorkspaceData,
	StatementLineWithCategory,
} from "@/features/bank-sync/queries";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { Input } from "@/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

type FilterKey = "todos" | "pendentes" | "classificados" | "ia";

const ALL_ACCOUNTS_VALUE = "__all__";

interface ReconciliationWorkspaceProps {
	data: ReconciliationWorkspaceData;
}

export function ReconciliationWorkspace({
	data,
}: ReconciliationWorkspaceProps) {
	const {
		connections,
		linkedAccounts,
		pluggyConfigured,
		payerOptions,
		defaultPayerId,
		accountOptions,
		categoryOptions,
	} = data;

	const [lines, setLines] = useState<StatementLineWithCategory[]>(
		data.statementLines,
	);
	const [selectedAccountId, setSelectedAccountId] = useState<string>(
		linkedAccounts[0]?.id ?? ALL_ACCOUNTS_VALUE,
	);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterKey>("todos");
	const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<"classify" | "match">("classify");
	const [connectionToDelete, setConnectionToDelete] = useState<{
		id: string;
		connectorName: string;
	} | null>(null);
	const [isSyncing, startSync] = useTransition();
	const [isSuggesting, startSuggest] = useTransition();
	const [isBulkImporting, startBulkImport] = useTransition();
	const [isBackfilling, startBackfill] = useTransition();

	const scopedLines = useMemo(() => {
		if (selectedAccountId === ALL_ACCOUNTS_VALUE) return lines;
		return lines.filter(
			(l) => l.linkedFinancialAccountId === selectedAccountId,
		);
	}, [lines, selectedAccountId]);

	const counts = useMemo(
		() => ({
			todos: scopedLines.length,
			pendentes: scopedLines.filter((l) => l.status === "unmatched").length,
			classificados: scopedLines.filter((l) => l.status === "matched").length,
			ia: scopedLines.filter((l) => l.categorySource === "ai").length,
		}),
		[scopedLines],
	);

	const filteredLines = useMemo(() => {
		const q = search.trim().toLowerCase();
		return scopedLines.filter((line) => {
			if (q && !line.description.toLowerCase().includes(q)) return false;
			if (filter === "pendentes") return line.status === "unmatched";
			if (filter === "classificados") return line.status === "matched";
			if (filter === "ia") return line.categorySource === "ai";
			return true;
		});
	}, [scopedLines, search, filter]);

	const selectedLine =
		filteredLines.find((l) => l.id === selectedLineId) ??
		scopedLines.find((l) => l.id === selectedLineId) ??
		null;

	const selectedAccount = linkedAccounts.find(
		(a) => a.id === selectedAccountId,
	);

	const selectNext = (fromId: string) => {
		const pool = filteredLines.filter((l) => l.id !== fromId);
		setSelectedLineId(pool[0]?.id ?? null);
	};

	const handleLineResolved = (
		lineId: string,
		status: "matched" | "ignored",
	) => {
		setLines((prev) =>
			prev.map((l) => (l.id === lineId ? { ...l, status } : l)),
		);
		selectNext(lineId);
	};

	const handleSync = () => {
		if (!selectedAccount) return;
		startSync(async () => {
			const result = await triggerManualSyncAction({
				connectionId: selectedAccount.connectionId,
			});
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleSuggestCategories = () => {
		startSuggest(async () => {
			const result = await suggestCategoriesForPendingLinesAction();
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleBulkImport = () => {
		startBulkImport(async () => {
			const result = await bulkImportStatementLinesAction();
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleBackfill = () => {
		startBackfill(async () => {
			const result = await backfillStatementLineAccountsAction();
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleIgnore = async (lineId: string) => {
		const result = await ignoreStatementLineAction({ statementLineId: lineId });
		if (result.success) {
			toast.success(result.message);
			handleLineResolved(lineId, "ignored");
		} else {
			toast.error(result.error);
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

	if (connections.length === 0) {
		return (
			<div className="flex flex-col gap-6">
				<div className="flex items-center justify-between gap-4">
					<div>
						<h1 className="font-semibold text-xl">Conciliação bancária</h1>
						<p className="text-muted-foreground text-sm">
							Conecte suas contas via Open Finance (Pluggy) pra sincronizar
							transações automaticamente.
						</p>
					</div>
					<ConnectBankButton pluggyConfigured={pluggyConfigured} />
				</div>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<RiBankLine />
						</EmptyMedia>
						<EmptyTitle>Nenhuma conexão bancária</EmptyTitle>
						<EmptyDescription>
							Conecte um banco para começar a conciliar transações.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Select
						value={selectedAccountId}
						onValueChange={setSelectedAccountId}
					>
						<SelectTrigger className="w-64">
							<SelectValue placeholder="Conta" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value={ALL_ACCOUNTS_VALUE}>
								Todas as contas
							</SelectItem>
							{linkedAccounts.map((account) => (
								<SelectItem key={account.id} value={account.id}>
									{account.name} — {account.connectorName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{selectedAccount && (
						<LinkAccountsDialog
							connectionId={selectedAccount.connectionId}
							connectorName={selectedAccount.connectorName}
							accountOptions={accountOptions}
						/>
					)}
				</div>
				<ConnectBankButton pluggyConfigured={pluggyConfigured} />
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!selectedAccount || isSyncing}
					onClick={handleSync}
				>
					<RiRefreshLine className="size-4" />
					{isSyncing ? "Sincronizando..." : "Sincronizar"}
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={isSuggesting}
					onClick={handleSuggestCategories}
				>
					<RiSparklingLine className="size-4" />
					{isSuggesting ? "Sugerindo..." : "Sugerir categorias"}
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={isBulkImporting}
					onClick={handleBulkImport}
				>
					<RiDownload2Line className="size-4" />
					{isBulkImporting ? "Importando..." : "Importar todos"}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={isBackfilling}
					onClick={handleBackfill}
				>
					{isBackfilling
						? "Corrigindo..."
						: "Corrigir vínculo de transações antigas"}
				</Button>
				{selectedAccount && (
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto text-destructive"
						onClick={() =>
							setConnectionToDelete({
								id: selectedAccount.connectionId,
								connectorName: selectedAccount.connectorName,
							})
						}
					>
						<RiCloseLine className="size-4" />
						Remover conexão
					</Button>
				)}
			</div>

			<div className="grid gap-4 lg:grid-cols-[380px_1fr]">
				<div className="flex flex-col gap-3 rounded-lg border">
					<div className="flex flex-col gap-2 border-b p-3">
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Buscar lançamentos..."
						/>
						<div className="flex flex-wrap gap-1.5">
							{(
								[
									["todos", "Todos"],
									["pendentes", "Pendentes"],
									["classificados", "Classificados"],
									["ia", "Categorizado por IA"],
								] as [FilterKey, string][]
							).map(([key, label]) => (
								<button
									key={key}
									type="button"
									onClick={() => setFilter(key)}
									className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
										filter === key
											? "border-primary bg-primary/10 text-primary"
											: "border-border text-muted-foreground hover:bg-accent"
									}`}
								>
									{label} ({counts[key]})
								</button>
							))}
						</div>
					</div>

					<div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto px-2 pb-2">
						{filteredLines.length === 0 ? (
							<p className="p-4 text-center text-muted-foreground text-sm">
								Nada por aqui.
							</p>
						) : (
							filteredLines.map((line) => {
								const isSelected = line.id === selectedLineId;
								const isDespesa = line.type === "despesa";
								return (
									<button
										key={line.id}
										type="button"
										onClick={() => {
											setSelectedLineId(line.id);
											setActiveTab("classify");
										}}
										className={`flex flex-col gap-1 rounded-md border p-2.5 text-left text-sm transition-colors ${
											isSelected
												? "border-primary bg-accent"
												: "border-transparent hover:bg-accent"
										}`}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium">
												{line.description}
											</span>
											<span
												className={
													isDespesa
														? "text-destructive shrink-0"
														: "shrink-0 text-emerald-600"
												}
											>
												{isDespesa ? "-" : "+"}
												{formatCurrency(Math.abs(Number(line.amount)))}
											</span>
										</div>
										<div className="flex items-center gap-2 text-muted-foreground text-xs">
											<span>{formatDateOnly(line.date)}</span>
											{line.categoryName && (
												<Badge variant="outline" className="text-[10px]">
													{line.categoryName}
												</Badge>
											)}
											{line.status === "matched" && (
												<RiCheckLine className="size-3.5 text-emerald-600" />
											)}
										</div>
									</button>
								);
							})
						)}
					</div>
				</div>

				<div className="rounded-lg border p-4">
					{!selectedLine ? (
						<div className="flex h-full min-h-64 items-center justify-center text-muted-foreground text-sm">
							Selecione uma transação à esquerda para classificar ou conciliar.
						</div>
					) : (
						<div className="flex flex-col gap-4">
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="text-muted-foreground text-xs">
										{formatDateOnly(selectedLine.date)}
									</p>
									<p className="font-medium">{selectedLine.description}</p>
								</div>
								<div className="flex items-center gap-3">
									<span className="font-semibold text-lg">
										{formatCurrency(Math.abs(Number(selectedLine.amount)))}
									</span>
									{selectedLine.status === "unmatched" && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => handleIgnore(selectedLine.id)}
										>
											Ignorar
										</Button>
									)}
								</div>
							</div>

							<Tabs
								value={activeTab}
								onValueChange={(v) => setActiveTab(v as "classify" | "match")}
							>
								<TabsList>
									<TabsTrigger value="classify">
										Classificar para lançamento
									</TabsTrigger>
									<TabsTrigger value="match">
										Escolher lançamento existente
									</TabsTrigger>
								</TabsList>
								<TabsContent value="classify" className="pt-4">
									<ClassifyLineForm
										key={selectedLine.id}
										line={selectedLine}
										payerOptions={payerOptions}
										defaultPayerId={defaultPayerId}
										accountOptions={accountOptions}
										categoryOptions={categoryOptions}
										onDone={() =>
											handleLineResolved(selectedLine.id, "matched")
										}
									/>
								</TabsContent>
								<TabsContent value="match" className="pt-4">
									<MatchExistingTab
										key={selectedLine.id}
										line={selectedLine}
										onDone={() =>
											handleLineResolved(selectedLine.id, "matched")
										}
									/>
								</TabsContent>
							</Tabs>
						</div>
					)}
				</div>
			</div>

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
		</div>
	);
}
