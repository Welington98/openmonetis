import { RiFireFill } from "@remixicon/react";
import { DIARY_STREAK_BADGE_THRESHOLDS } from "@/features/diary/lib/constants";
import type { StreakSummary } from "@/features/diary/queries";
import { Progress } from "@/shared/components/ui/progress";

function findNextMilestone(currentStreak: number) {
	return DIARY_STREAK_BADGE_THRESHOLDS.find(
		(badge) => badge.days > currentStreak,
	);
}

type DiaryStreakIndicatorProps = {
	streak: StreakSummary;
};

export function DiaryStreakIndicator({ streak }: DiaryStreakIndicatorProps) {
	const nextMilestone = findNextMilestone(streak.currentStreak);
	const progressToNext = nextMilestone
		? Math.min(100, (streak.currentStreak / nextMilestone.days) * 100)
		: 100;

	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
			<div className="flex items-center gap-3">
				<div
					className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
						streak.currentStreak > 0
							? "bg-primary/15 text-primary"
							: "bg-muted text-muted-foreground"
					}`}
				>
					<RiFireFill className="size-6" />
				</div>
				<div>
					<p className="text-2xl font-bold leading-none">
						{streak.currentStreak}{" "}
						<span className="text-sm font-normal text-muted-foreground">
							{streak.currentStreak === 1 ? "dia seguido" : "dias seguidos"}
						</span>
					</p>
					<p className="text-xs text-muted-foreground">
						Recorde: {streak.longestStreak}{" "}
						{streak.longestStreak === 1 ? "dia" : "dias"}
					</p>
				</div>
			</div>

			{streak.isBrokenSinceLastEntry && streak.longestStreak > 0 && (
				<p className="text-xs text-muted-foreground">
					Sua sequência quebrou. Registre hoje para começar uma nova.
				</p>
			)}

			{nextMilestone && (
				<div className="space-y-1">
					<Progress value={progressToNext} className="h-1.5" />
					<p className="text-xs text-muted-foreground">
						Faltam {nextMilestone.days - streak.currentStreak}{" "}
						{nextMilestone.days - streak.currentStreak === 1 ? "dia" : "dias"}{" "}
						para "{nextMilestone.label}"
					</p>
				</div>
			)}
		</div>
	);
}
