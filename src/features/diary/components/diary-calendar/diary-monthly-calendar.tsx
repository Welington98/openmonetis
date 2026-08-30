"use client";

import { useMemo, useState } from "react";
import { DiaryCalendarGrid } from "@/features/diary/components/diary-calendar/diary-calendar-grid";
import { DiaryCalendarLegend } from "@/features/diary/components/diary-calendar/diary-calendar-legend";
import type { DiaryCalendarDay } from "@/features/diary/components/diary-calendar/diary-day-cell";
import { DiaryDayDetailDialog } from "@/features/diary/components/diary-calendar/diary-day-detail-dialog";
import type { DiaryDayStatus } from "@/features/diary/lib/calendar-status";
import type { DiaryCalendarData } from "@/features/diary/queries";
import { formatDateKey } from "@/shared/utils/calendar";
import { getBusinessDateString } from "@/shared/utils/date";
import { parsePeriod } from "@/shared/utils/period";

const getWeekdayIndex = (date: Date) => {
	const day = date.getUTCDay();
	return day === 0 ? 6 : day - 1;
};

function buildDays(
	period: string,
	entriesByDate: Map<string, DiaryCalendarData["entries"][number]>,
	statuses: Record<string, DiaryDayStatus>,
): DiaryCalendarDay[] {
	const { year, month } = parsePeriod(period);
	const monthIndex = month - 1;
	const startOfMonth = new Date(Date.UTC(year, monthIndex, 1));
	const offset = getWeekdayIndex(startOfMonth);
	const startDate = new Date(Date.UTC(year, monthIndex, 1 - offset));
	const totalCells = 42;
	const todayKey = getBusinessDateString();

	const days: DiaryCalendarDay[] = [];

	for (let index = 0; index < totalCells; index += 1) {
		const currentDate = new Date(startDate);
		currentDate.setUTCDate(startDate.getUTCDate() + index);

		const dateKey = formatDateKey(currentDate);
		const isCurrentMonth = currentDate.getUTCMonth() === monthIndex;

		days.push({
			date: dateKey,
			label: currentDate.getUTCDate().toString(),
			isCurrentMonth,
			isToday: dateKey === todayKey,
			status: statuses[dateKey] ?? "gray",
			entry: entriesByDate.get(dateKey) ?? null,
		});
	}

	return days;
}

type DiaryMonthlyCalendarProps = {
	period: string;
	data: DiaryCalendarData;
};

export function DiaryMonthlyCalendar({
	period,
	data,
}: DiaryMonthlyCalendarProps) {
	const entriesByDate = useMemo(() => {
		const map = new Map<string, DiaryCalendarData["entries"][number]>();
		for (const entry of data.entries) {
			map.set(entry.entryDate, entry);
		}
		return map;
	}, [data.entries]);

	const days = useMemo(
		() => buildDays(period, entriesByDate, data.statuses),
		[period, entriesByDate, data.statuses],
	);

	const [selectedDay, setSelectedDay] = useState<DiaryCalendarDay | null>(null);
	const [isDialogOpen, setDialogOpen] = useState(false);

	const handleSelectDay = (day: DiaryCalendarDay) => {
		setSelectedDay(day);
		setDialogOpen(true);
	};

	const handleClose = () => {
		setDialogOpen(false);
		setSelectedDay(null);
	};

	return (
		<div className="space-y-3">
			<DiaryCalendarLegend />
			<DiaryCalendarGrid days={days} onSelectDay={handleSelectDay} />
			<DiaryDayDetailDialog
				open={isDialogOpen}
				day={selectedDay}
				onClose={handleClose}
			/>
		</div>
	);
}
