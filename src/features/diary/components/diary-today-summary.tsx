"use client";

import { RiPencilLine } from "@remixicon/react";
import { useState } from "react";
import { DiaryCheckinForm } from "@/features/diary/components/diary-checkin-form";
import {
	DIARY_CATEGORIES,
	DIARY_CLASSIFICATIONS,
} from "@/features/diary/lib/constants";
import type { DiaryEntryData } from "@/features/diary/queries";
import { Button } from "@/shared/components/ui/button";
import { formatCurrency } from "@/shared/utils/currency";

function labelFor(
	list: ReadonlyArray<{ value: string; label: string }>,
	value: string | null,
) {
	if (!value) return null;
	return list.find((item) => item.value === value)?.label ?? value;
}

type DiaryTodaySummaryProps = {
	entry: DiaryEntryData;
};

export function DiaryTodaySummary({ entry }: DiaryTodaySummaryProps) {
	const [isEditing, setIsEditing] = useState(false);

	if (isEditing) {
		return <DiaryCheckinForm existingEntry={entry} />;
	}

	const categoryLabel = labelFor(DIARY_CATEGORIES, entry.category);
	const classificationLabel = labelFor(
		DIARY_CLASSIFICATIONS,
		entry.classification,
	);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm text-muted-foreground">
						Check-in de hoje já registrado
					</p>
					<p className="text-lg font-semibold">
						{entry.hadExpense
							? `Você gastou ${formatCurrency(entry.amount ?? 0)} hoje`
							: "Sem gastos hoje"}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setIsEditing(true)}
				>
					<RiPencilLine />
					Editar
				</Button>
			</div>

			{entry.hadExpense && (categoryLabel || classificationLabel) && (
				<div className="flex flex-wrap gap-2 text-sm">
					{categoryLabel && (
						<span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
							{categoryLabel}
						</span>
					)}
					{classificationLabel && (
						<span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
							{classificationLabel}
						</span>
					)}
				</div>
			)}

			{entry.note && (
				<p className="rounded-md border bg-card p-3 text-sm text-muted-foreground">
					“{entry.note}”
				</p>
			)}
		</div>
	);
}
