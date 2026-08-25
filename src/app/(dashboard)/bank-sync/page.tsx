import { connection } from "next/server";
import { BankSyncPage } from "@/features/bank-sync/components/bank-sync-page";
import {
	fetchBankConnections,
	fetchBankSyncDialogData,
	fetchPluggyConfigured,
	fetchStatementLines,
} from "@/features/bank-sync/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();

	const [connections, statementLines, dialogData, pluggyConfigured] =
		await Promise.all([
			fetchBankConnections(userId),
			fetchStatementLines(userId, "unmatched"),
			fetchBankSyncDialogData(userId),
			fetchPluggyConfigured(),
		]);

	return (
		<main className="flex flex-col gap-6">
			<BankSyncPage
				pluggyConfigured={pluggyConfigured}
				connections={connections}
				statementLines={statementLines}
				payerOptions={dialogData.payerOptions}
				splitPayerOptions={dialogData.splitPayerOptions}
				defaultPayerId={dialogData.defaultPayerId}
				accountOptions={dialogData.accountOptions}
				cardOptions={dialogData.cardOptions}
				categoryOptions={dialogData.categoryOptions}
			/>
		</main>
	);
}
