import { connection } from "next/server";
import { ReconciliationWorkspace } from "@/features/bank-sync/components/reconciliation-workspace";
import { fetchReconciliationWorkspaceData } from "@/features/bank-sync/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const data = await fetchReconciliationWorkspaceData(userId);

	return (
		<main className="flex flex-col gap-6">
			<ReconciliationWorkspace data={data} />
		</main>
	);
}
