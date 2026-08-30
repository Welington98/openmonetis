"use client";

import { RiCloseLine } from "@remixicon/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { dismissWeeklySummaryAction } from "@/features/diary/actions";
import type { WeeklySummary } from "@/features/diary/queries";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

type DiaryWeeklySummaryCardProps = {
	summary: WeeklySummary;
};

export function DiaryWeeklySummaryCard({
	summary,
}: DiaryWeeklySummaryCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	if (summary.isDismissed) {
		return null;
	}

	const handleDismiss = () => {
		startTransition(async () => {
			await dismissWeeklySummaryAction();
			router.refresh();
		});
	};

	const comparisonLabel =
		summary.comparisonPct === null
			? null
			: summary.comparisonPct >= 0
				? `${summary.comparisonPct.toFixed(0)}% a mais que a semana passada`
				: `${Math.abs(summary.comparisonPct).toFixed(0)}% a menos que a semana passada`;

	return (
		<Card className="relative flex flex-col gap-2 p-4">
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="absolute right-2 top-2"
				onClick={handleDismiss}
				disabled={isPending}
				aria-label="Dispensar resumo semanal"
			>
				<RiCloseLine />
			</Button>

			<p className="pr-8 text-sm font-semibold">Resumo da semana</p>
			<p className="text-sm text-muted-foreground">
				{summary.daysLogged}/7 dias registrados · gasto total{" "}
				{formatCurrency(summary.totalSpent)}
				{comparisonLabel ? ` · ${comparisonLabel}` : ""}
			</p>
			<p className="text-sm text-primary">{summary.message}</p>
			<Link
				href="/diary/calendar?view=week"
				className="text-sm font-medium text-foreground underline underline-offset-4"
			>
				Ver semana completa
			</Link>
		</Card>
	);
}
