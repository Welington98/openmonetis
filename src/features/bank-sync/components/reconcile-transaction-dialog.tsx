"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	matchStatementLineAction,
	type StatementLineMatchCandidate,
	searchUnmatchedStatementLinesAction,
} from "@/features/bank-sync/actions";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

interface ReconcileTransactionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	transactionId: string;
	transactionName: string;
	onDone: () => void;
}

export function ReconcileTransactionDialog({
	open,
	onOpenChange,
	transactionId,
	transactionName,
	onDone,
}: ReconcileTransactionDialogProps) {
	const [query, setQuery] = useState(transactionName);
	const [isSearching, setIsSearching] = useState(false);
	const [candidates, setCandidates] = useState<StatementLineMatchCandidate[]>(
		[],
	);
	const [matchingId, setMatchingId] = useState<string | null>(null);

	useEffect(() => {
		if (open) setQuery(transactionName);
	}, [open, transactionName]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setIsSearching(true);
		const timeout = setTimeout(async () => {
			const result = await searchUnmatchedStatementLinesAction({ query });
			if (cancelled) return;
			if (result.success && result.data) {
				setCandidates(result.data.lines);
			}
			setIsSearching(false);
		}, 300);

		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, [query, open]);

	const handleMatch = async (statementLineId: string) => {
		setMatchingId(statementLineId);
		try {
			const result = await matchStatementLineAction({
				statementLineId,
				transactionId,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success("Lançamento conciliado com o extrato.");
			onOpenChange(false);
			onDone();
		} finally {
			setMatchingId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Conciliar com extrato bancário</DialogTitle>
					<DialogDescription>
						Escolha a transação sincronizada do extrato que corresponde a "
						{transactionName}".
					</DialogDescription>
				</DialogHeader>

				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Buscar por descrição..."
				/>

				{isSearching ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
					</div>
				) : candidates.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhuma transação pendente do extrato encontrada com esse termo.
					</p>
				) : (
					<div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
						{candidates.map((candidate) => (
							<div
								key={candidate.id}
								className="flex items-center justify-between gap-3 rounded-md border p-3"
							>
								<div className="flex flex-col">
									<span className="font-medium text-sm">
										{candidate.description}
									</span>
									<span className="text-muted-foreground text-xs">
										{formatDateOnly(candidate.date)}
										{candidate.categoryName
											? ` · ${candidate.categoryName}`
											: ""}
									</span>
								</div>
								<div className="flex items-center gap-3">
									<span className="font-medium text-sm">
										{formatCurrency(Math.abs(Number(candidate.amount)))}
									</span>
									<Button
										size="sm"
										variant="outline"
										disabled={matchingId === candidate.id}
										onClick={() => handleMatch(candidate.id)}
									>
										Vincular
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
