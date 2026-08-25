"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	matchStatementLineAction,
	searchTransactionsToMatchAction,
	type TransactionMatchCandidate,
} from "@/features/bank-sync/actions";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import type { StatementLineWithCategory } from "../queries";

interface MatchExistingTabProps {
	line: StatementLineWithCategory;
	onDone: () => void;
}

export function MatchExistingTab({ line, onDone }: MatchExistingTabProps) {
	const [query, setQuery] = useState(line.description);
	const [isSearching, setIsSearching] = useState(false);
	const [candidates, setCandidates] = useState<TransactionMatchCandidate[]>([]);
	const [matchingId, setMatchingId] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refaz busca quando a linha ou o termo muda
	useEffect(() => {
		let cancelled = false;
		setIsSearching(true);
		const timeout = setTimeout(async () => {
			const result = await searchTransactionsToMatchAction({
				query,
				accountId: line.linkedFinancialAccountId,
			});
			if (cancelled) return;
			if (result.success && result.data) {
				setCandidates(result.data.transactions);
			}
			setIsSearching(false);
		}, 300);

		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, [query, line.id, line.linkedFinancialAccountId]);

	const handleMatch = async (transactionId: string) => {
		setMatchingId(transactionId);
		try {
			const result = await matchStatementLineAction({
				statementLineId: line.id,
				transactionId,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success("Vinculado ao lançamento existente.");
			onDone();
		} finally {
			setMatchingId(null);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			<Input
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Buscar lançamentos por nome..."
			/>

			{isSearching ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-14 w-full" />
					<Skeleton className="h-14 w-full" />
				</div>
			) : candidates.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhum lançamento encontrado com esse termo.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{candidates.map((candidate) => (
						<div
							key={candidate.id}
							className="flex items-center justify-between gap-3 rounded-md border p-3"
						>
							<div className="flex flex-col">
								<span className="font-medium text-sm">{candidate.name}</span>
								<span className="text-muted-foreground text-xs">
									{formatDateOnly(candidate.purchaseDate)}
									{candidate.categoryName ? ` · ${candidate.categoryName}` : ""}
									{!candidate.isSettled ? " · não realizado" : ""}
								</span>
							</div>
							<div className="flex items-center gap-3">
								<span className="font-medium text-sm">
									{formatCurrency(Number(candidate.amount))}
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
		</div>
	);
}
