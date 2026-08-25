import { connection } from "next/server";
import { ReconciliationPage } from "@/features/bank-sync/components/reconciliation-page";
import { fetchReconciliationOverview } from "@/features/bank-sync/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const overview = await fetchReconciliationOverview(userId);

	return (
		<main className="flex flex-col gap-6">
			<ReconciliationPage overview={overview} />
		</main>
	);
}
