import { connection } from "next/server";
import { AccountsPage } from "@/features/accounts/components/accounts-page";
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
import { fetchBankConnections } from "@/features/bank-sync/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const [{ activeAccounts, archivedAccounts, logoOptions }, bankConnections] =
		await Promise.all([
			fetchAllAccountsForUser(userId),
			fetchBankConnections(userId),
		]);

	return (
		<main className="flex flex-col items-start gap-6">
			<AccountsPage
				accounts={activeAccounts}
				archivedAccounts={archivedAccounts}
				logoOptions={logoOptions}
				bankConnections={bankConnections.map((c) => ({
					id: c.id,
					connectorName: c.connectorName,
				}))}
			/>
		</main>
	);
}
