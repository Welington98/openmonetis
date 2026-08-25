import { connection } from "next/server";
import { SavingsGoalsPage } from "@/features/savings-goals/components/savings-goals-page";
import { fetchSavingsGoalsForUser } from "@/features/savings-goals/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const { goals, accountsOptions } = await fetchSavingsGoalsForUser(userId);

	return (
		<main className="flex flex-col gap-6">
			<SavingsGoalsPage goals={goals} accounts={accountsOptions} />
		</main>
	);
}
