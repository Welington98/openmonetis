import { connection } from "next/server";
import { AchievementsPage } from "@/features/diary/components/achievements/achievements-page";
import { fetchAchievements } from "@/features/diary/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const data = await fetchAchievements(userId);

	return (
		<main>
			<AchievementsPage data={data} />
		</main>
	);
}
