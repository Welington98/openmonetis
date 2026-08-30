"use client";

import type { DiaryCalendarDay } from "@/features/diary/components/diary-calendar/diary-day-cell";
import { DiaryDayCell } from "@/features/diary/components/diary-calendar/diary-day-cell";
import { WEEK_DAYS_SHORT } from "@/shared/utils/calendar";

type DiaryCalendarGridProps = {
	days: DiaryCalendarDay[];
	onSelectDay: (day: DiaryCalendarDay) => void;
};

export function DiaryCalendarGrid({
	days,
	onSelectDay,
}: DiaryCalendarGridProps) {
	return (
		<div className="overflow-hidden">
			<div className="grid grid-cols-7 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
				{WEEK_DAYS_SHORT.map((dayName) => (
					<span key={dayName} className="text-center">
						{dayName}
					</span>
				))}
			</div>

			<div className="grid grid-cols-7 gap-px px-px pb-px pt-px">
				{days.map((day) => (
					<div key={day.date} className="h-20 p-0.5 sm:h-24">
						<DiaryDayCell day={day} onSelect={onSelectDay} />
					</div>
				))}
			</div>
		</div>
	);
}
