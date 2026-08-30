import { RiLockLine, RiTrophyLine } from "@remixicon/react";
import type { BadgeDefinition } from "@/features/diary/lib/achievements";
import { Card } from "@/shared/components/ui/card";
import { formatDateOnly } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

type AchievementBadgeCardProps = {
	badge: BadgeDefinition;
	earnedAt: string | null;
};

export function AchievementBadgeCard({
	badge,
	earnedAt,
}: AchievementBadgeCardProps) {
	const isEarned = earnedAt !== null;

	return (
		<Card
			className={cn(
				"flex flex-col items-center gap-2 p-5 text-center",
				!isEarned && "opacity-60",
			)}
		>
			<div
				className={cn(
					"flex size-14 items-center justify-center rounded-full",
					isEarned
						? "bg-primary/15 text-primary"
						: "bg-muted text-muted-foreground",
				)}
			>
				{isEarned ? (
					<RiTrophyLine className="size-7" />
				) : (
					<RiLockLine className="size-6" />
				)}
			</div>
			<p className="text-sm font-semibold">{badge.label}</p>
			<p className="text-xs text-muted-foreground">
				{isEarned ? `Conquistado em ${formatDateOnly(earnedAt)}` : "Bloqueado"}
			</p>
		</Card>
	);
}
