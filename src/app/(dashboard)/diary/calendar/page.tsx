import { connection } from "next/server";
import { DiaryMonthlyCalendar } from "@/features/diary/components/diary-calendar/diary-monthly-calendar";
import { DiaryViewToggle } from "@/features/diary/components/diary-calendar/diary-view-toggle";
import { DiaryWeekNavigation } from "@/features/diary/components/diary-calendar/diary-week-navigation";
import { DiaryWeekView } from "@/features/diary/components/diary-calendar/diary-week-view";
import { getWeekStart } from "@/features/diary/lib/week";
import {
	fetchDiaryCalendarData,
	fetchDiaryWeekData,
} from "@/features/diary/queries";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { getUserId } from "@/shared/lib/auth/server";
import { getBusinessDateString } from "@/shared/utils/date";
import { parsePeriodParam } from "@/shared/utils/period";

type PageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const resolvedParams = searchParams ? await searchParams : undefined;

	const view = firstParam(resolvedParams?.view) === "week" ? "week" : "month";

	if (view === "week") {
		const semanaParam = firstParam(resolvedParams?.semana);
		const weekStart =
			semanaParam && /^\d{4}-\d{2}-\d{2}$/.test(semanaParam)
				? getWeekStart(semanaParam)
				: getWeekStart(getBusinessDateString());

		const weekData = await fetchDiaryWeekData({ userId, weekStart });

		return (
			<main className="flex flex-col gap-4">
				<DiaryViewToggle view="week" />
				<DiaryWeekNavigation />
				<DiaryWeekView data={weekData} />
			</main>
		);
	}

	const { period } = parsePeriodParam(firstParam(resolvedParams?.periodo));
	const calendarData = await fetchDiaryCalendarData({ userId, period });

	return (
		<main className="flex flex-col gap-4">
			<DiaryViewToggle view="month" />
			<MonthNavigation />
			<DiaryMonthlyCalendar period={period} data={calendarData} />
		</main>
	);
}
