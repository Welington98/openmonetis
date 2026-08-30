import { connection } from "next/server";
import { DiaryMonthlyCalendar } from "@/features/diary/components/diary-calendar/diary-monthly-calendar";
import { fetchDiaryCalendarData } from "@/features/diary/queries";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { getUserId } from "@/shared/lib/auth/server";
import { parsePeriodParam } from "@/shared/utils/period";

type PageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const resolvedParams = searchParams ? await searchParams : undefined;
	const periodoParam = resolvedParams?.periodo;
	const periodoValue = Array.isArray(periodoParam)
		? periodoParam[0]
		: periodoParam;

	const { period } = parsePeriodParam(periodoValue);

	const calendarData = await fetchDiaryCalendarData({ userId, period });

	return (
		<main className="flex flex-col gap-4">
			<MonthNavigation />
			<DiaryMonthlyCalendar period={period} data={calendarData} />
		</main>
	);
}
