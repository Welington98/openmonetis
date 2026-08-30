"use client";

import { useState } from "react";
import { DIARY_STATUS_STYLES } from "@/features/diary/components/diary-calendar/diary-calendar-legend";
import type { DiaryCalendarDay } from "@/features/diary/components/diary-calendar/diary-day-cell";
import { DiaryDayDetailDialog } from "@/features/diary/components/diary-calendar/diary-day-detail-dialog";
import type { DiaryWeekData } from "@/features/diary/queries";
import { WEEK_DAYS_SHORT } from "@/shared/utils/calendar";
import { formatCurrency } from "@/shared/utils/currency";
import {
	getBusinessDateString,
	parseLocalDateString,
} from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

const STATUS_CARD_CLASS: Record<DiaryCalendarDay["status"], string> = {
	green: "border-l-success bg-success/5 hover:bg-success/10",
	yellow:
		"border-l-amber-500 bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-900/10 dark:hover:bg-amber-900/20",
	red: "border-l-destructive bg-destructive/5 hover:bg-destructive/10",
	gray: "border-l-muted-foreground/30 bg-muted/20 hover:bg-muted/30",
};

type DiaryWeekViewProps = {
	data: DiaryWeekData;
};

export function DiaryWeekView({ data }: DiaryWeekViewProps) {
	const todayKey = getBusinessDateString();
	const [selectedDay, setSelectedDay] = useState<DiaryCalendarDay | null>(null);
	const [isDialogOpen, setDialogOpen] = useState(false);

	const handleSelect = (day: DiaryCalendarDay) => {
		setSelectedDay(day);
		setDialogOpen(true);
	};

	return (
		<div className="flex flex-col gap-2">
			{data.days.map((day, index) => {
				const date = parseLocalDateString(day.date);
				const isToday = day.date === todayKey;
				const calendarDay: DiaryCalendarDay = {
					date: day.date,
					label: "",
					isCurrentMonth: true,
					isToday,
					status: day.status,
					entry: day.entry,
				};

				return (
					<button
						key={day.date}
						type="button"
						onClick={() => handleSelect(calendarDay)}
						className={cn(
							"flex items-center justify-between gap-3 rounded-lg border border-l-4 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							STATUS_CARD_CLASS[day.status],
							isToday && "ring-1 ring-primary/50",
						)}
					>
						<div className="flex items-center gap-3">
							<div className="flex flex-col items-center leading-none">
								<span className="text-xs font-medium uppercase text-muted-foreground">
									{WEEK_DAYS_SHORT[index]}
								</span>
								<span className="text-lg font-semibold">{date.getDate()}</span>
							</div>
							<div className="flex flex-col">
								<span className="text-sm font-medium">
									{DIARY_STATUS_STYLES[day.status].label}
								</span>
								{day.entry?.note && (
									<span className="truncate text-xs text-muted-foreground">
										“{day.entry.note}”
									</span>
								)}
							</div>
						</div>

						{day.entry?.hadExpense && (
							<span className="shrink-0 text-sm font-semibold">
								{formatCurrency(day.entry.amount ?? 0)}
							</span>
						)}
					</button>
				);
			})}

			<DiaryDayDetailDialog
				open={isDialogOpen}
				day={selectedDay}
				onClose={() => {
					setDialogOpen(false);
					setSelectedDay(null);
				}}
			/>
		</div>
	);
}
