"use client";

import Link from "next/link";
import { DIARY_STATUS_STYLES } from "@/features/diary/components/diary-calendar/diary-calendar-legend";
import type { DiaryCalendarDay } from "@/features/diary/components/diary-calendar/diary-day-cell";
import {
	DIARY_CATEGORIES,
	DIARY_CLASSIFICATIONS,
} from "@/features/diary/lib/constants";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { formatCurrency } from "@/shared/utils/currency";
import { friendlyDate, parseLocalDateString } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

function labelFor(
	list: ReadonlyArray<{ value: string; label: string }>,
	value: string | null | undefined,
) {
	if (!value) return null;
	return list.find((item) => item.value === value)?.label ?? value;
}

type DiaryDayDetailDialogProps = {
	open: boolean;
	day: DiaryCalendarDay | null;
	onClose: () => void;
};

export function DiaryDayDetailDialog({
	open,
	day,
	onClose,
}: DiaryDayDetailDialogProps) {
	if (!day) {
		return null;
	}

	const { entry } = day;
	const categoryLabel = labelFor(DIARY_CATEGORIES, entry?.category);
	const classificationLabel = labelFor(
		DIARY_CLASSIFICATIONS,
		entry?.classification,
	);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && onClose()}>
			<DialogContent>
				<DialogHeader>
					<div className="flex items-center gap-2">
						<span
							className={cn(
								"size-2.5 shrink-0 rounded-full",
								DIARY_STATUS_STYLES[day.status].dot,
							)}
							aria-hidden
						/>
						<DialogTitle className="capitalize">
							{friendlyDate(parseLocalDateString(day.date))}
						</DialogTitle>
					</div>
					<DialogDescription>
						{DIARY_STATUS_STYLES[day.status].label}
					</DialogDescription>
				</DialogHeader>

				{entry ? (
					<div className="space-y-3">
						<p className="text-lg font-semibold">
							{entry.hadExpense
								? formatCurrency(entry.amount ?? 0)
								: "Sem gastos nesse dia"}
						</p>

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
				) : (
					<p className="text-sm text-muted-foreground">
						Nenhum check-in foi registrado nesse dia.
					</p>
				)}

				<DialogFooter>
					{day.isToday ? (
						<Button asChild className="w-full sm:w-auto">
							<Link href="/diary">Editar no Diário</Link>
						</Button>
					) : (
						<Button
							variant="outline"
							onClick={onClose}
							className="w-full sm:w-auto"
						>
							Fechar
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
