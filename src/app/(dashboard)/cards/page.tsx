import { connection } from "next/server";
import { fetchBankConnections } from "@/features/bank-sync/queries";
import { CardsPage } from "@/features/cards/components/cards-page";
import { fetchAllCardsForUser } from "@/features/cards/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const [
		{ activeCards, archivedCards, accounts, logoOptions },
		bankConnections,
	] = await Promise.all([
		fetchAllCardsForUser(userId),
		fetchBankConnections(userId),
	]);

	return (
		<main className="flex flex-col gap-6">
			<CardsPage
				cards={activeCards}
				archivedCards={archivedCards}
				accounts={accounts}
				logoOptions={logoOptions}
				bankConnections={bankConnections.map((c) => ({
					id: c.id,
					connectorName: c.connectorName,
				}))}
			/>
		</main>
	);
}
