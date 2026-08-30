import { AchievementBadgeCard } from "@/features/diary/components/achievements/achievement-badge-card";
import type { AchievementsData } from "@/features/diary/queries";

type AchievementsPageProps = {
	data: AchievementsData;
};

export function AchievementsPage({ data }: AchievementsPageProps) {
	const mostRecentByBadge = new Map<string, string>();
	for (const item of data.earned) {
		const current = mostRecentByBadge.get(item.badgeKey);
		if (!current || item.earnedAt > current) {
			mostRecentByBadge.set(item.badgeKey, item.earnedAt);
		}
	}

	const earnedCount = data.catalog.filter((badge) =>
		mostRecentByBadge.has(badge.key),
	).length;

	return (
		<div className="mx-auto flex w-full max-w-lg flex-col gap-6">
			<div>
				<h1 className="text-xl font-semibold">Minhas conquistas</h1>
				<p className="text-sm text-muted-foreground">
					{earnedCount}/{data.catalog.length} conquistas desbloqueadas
				</p>
			</div>

			<div className="grid grid-cols-2 gap-3">
				{data.catalog.map((badge) => (
					<AchievementBadgeCard
						key={badge.key}
						badge={badge}
						earnedAt={mostRecentByBadge.get(badge.key) ?? null}
					/>
				))}
			</div>
		</div>
	);
}
