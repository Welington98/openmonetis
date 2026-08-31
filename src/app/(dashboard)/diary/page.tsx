import { RiAlarmLine, RiAwardLine, RiCalendarLine } from "@remixicon/react";
import Link from "next/link";
import { connection } from "next/server";
import { DiaryCheckinForm } from "@/features/diary/components/diary-checkin-form";
import { DiaryDailyBudgetCard } from "@/features/diary/components/diary-daily-budget-card";
import { DiaryStreakIndicator } from "@/features/diary/components/diary-streak-indicator";
import { DiaryTodaySummary } from "@/features/diary/components/diary-today-summary";
import { DiaryWeeklySummaryCard } from "@/features/diary/components/diary-weekly-summary-card";
import {
	pickReminderMessage,
	shouldShowReminder,
} from "@/features/diary/lib/reminder";
import {
	fetchDiaryDailyBudgetSummary,
	fetchDiarySettings,
	fetchStreakSummary,
	fetchTodayEntry,
	fetchWeeklySummary,
} from "@/features/diary/queries";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { getUserId } from "@/shared/lib/auth/server";
import {
	getBusinessDateString,
	getBusinessTimeString,
} from "@/shared/utils/date";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const [todayEntry, streak, weeklySummary, diarySettings] = await Promise.all([
		fetchTodayEntry(userId),
		fetchStreakSummary(userId),
		fetchWeeklySummary(userId),
		fetchDiarySettings(userId),
	]);
	const dailyBudgetInfo = await fetchDiaryDailyBudgetSummary(userId);

	const today = getBusinessDateString();
	const showReminder = shouldShowReminder({
		reminderEnabled: diarySettings.reminderEnabled,
		reminderTime: diarySettings.reminderTime,
		hasCheckedInToday: streak.hasCheckedInToday,
		currentTime: getBusinessTimeString(),
	});
	const reminderMessage = pickReminderMessage(
		Number(today.replaceAll("-", "")),
	);

	return (
		<main className="mx-auto flex w-full max-w-lg flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-semibold">Diário financeiro</h1>
					<p className="text-sm text-muted-foreground">
						{todayEntry
							? "Confira o que você registrou hoje."
							: "Como foi seu dinheiro hoje?"}
					</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="icon" asChild>
						<Link href="/diary/calendar" aria-label="Calendário do diário">
							<RiCalendarLine />
						</Link>
					</Button>
					<Button variant="outline" size="icon" asChild>
						<Link href="/diary/achievements" aria-label="Minhas conquistas">
							<RiAwardLine />
						</Link>
					</Button>
				</div>
			</div>

			{showReminder && (
				<div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
					<RiAlarmLine className="size-4 shrink-0" />
					<span>{reminderMessage}</span>
				</div>
			)}

			<DiaryStreakIndicator streak={streak} />

			<Link href="/daily-budget" className="block">
				<DiaryDailyBudgetCard info={dailyBudgetInfo} />
			</Link>

			<DiaryWeeklySummaryCard summary={weeklySummary} />

			<Card className="p-5">
				{todayEntry ? (
					<DiaryTodaySummary entry={todayEntry} />
				) : (
					<DiaryCheckinForm />
				)}
			</Card>
		</main>
	);
}
