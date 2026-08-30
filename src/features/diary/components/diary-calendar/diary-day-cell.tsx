"use client";

import type { KeyboardEvent } from "react";
import { DIARY_STATUS_STYLES } from "@/features/diary/components/diary-calendar/diary-calendar-legend";
import type { DiaryDayStatus } from "@/features/diary/lib/calendar-status";
import type { DiaryEntryData } from "@/features/diary/queries";
import { formatCurrency } from "@/shared/utils/currency";
import { cn } from "@/shared/utils/ui";

export type DiaryCalendarDay = {
	date: string;
	label: string;
	isCurrentMonth: boolean;
	isToday: boolean;
	status: DiaryDayStatus;
	entry: DiaryEntryData | null;
};

const STATUS_CELL_CLASS: Record<DiaryDayStatus, string> = {
	green: "bg-success/10 hover:bg-success/15",
	yellow:
		"bg-amber-100 hover:bg-amber-200/70 dark:bg-amber-900/15 dark:hover:bg-amber-900/25",
	red: "bg-destructive/10 hover:bg-destructive/15",
	gray: "bg-muted/30 hover:bg-muted/50",
};

type DiaryDayCellProps = {
	day: DiaryCalendarDay;
	onSelect: (day: DiaryCalendarDay) => void;
};

export function DiaryDayCell({ day, onSelect }: DiaryDayCellProps) {
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelect(day);
		}
	};

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelect(day)}
			onKeyDown={handleKeyDown}
			className={cn(
				"group flex h-full cursor-pointer flex-col gap-1 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				day.isCurrentMonth ? STATUS_CELL_CLASS[day.status] : "bg-muted/10",
				!day.isCurrentMonth && "opacity-50",
				day.isToday && "border-primary/70",
			)}
		>
			<div className="flex items-center justify-between">
				<span
					className={cn(
						"text-sm font-medium leading-none",
						day.isToday
							? "flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
							: "text-foreground/90",
					)}
				>
					{day.label}
				</span>
				{day.isCurrentMonth && (
					<span
						className={cn(
							"size-2 shrink-0 rounded-full",
							DIARY_STATUS_STYLES[day.status].dot,
						)}
						aria-hidden
					/>
				)}
			</div>

			{day.isCurrentMonth && day.entry?.hadExpense && (
				<span className="truncate text-xs font-medium text-foreground/80">
					{formatCurrency(day.entry.amount ?? 0)}
				</span>
			)}
		</div>
	);
}
