import { connection } from "next/server";
import { PayablesPage } from "@/features/payables/components/payables-page";
import { fetchPayablesSnapshot } from "@/features/payables/queries";
import { getSingleParam } from "@/features/transactions/lib/page-helpers";
import { getUserId } from "@/shared/lib/auth/server";

type PageSearchParams = Promise<
	Record<string, string | string[] | undefined> | undefined
>;

type PageProps = {
	searchParams?: PageSearchParams;
};

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const userId = await getUserId();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;

	const tabParam = getSingleParam(resolvedSearchParams, "tab");
	const initialTab = tabParam === "receber" ? "receber" : "pagar";

	const snapshot = await fetchPayablesSnapshot(userId);

	return (
		<PayablesPage
			initialTab={initialTab}
			payables={snapshot.payables}
			receivables={snapshot.receivables}
			paymentAccountOptions={snapshot.paymentAccountOptions}
			categoryOptions={snapshot.categoryOptions}
			payerOptions={snapshot.payerOptions}
		/>
	);
}
