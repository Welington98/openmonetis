import { connection } from "next/server";
import { CategoriesPage } from "@/features/categories/components/categories-page";
import { fetchCategoriesForUser } from "@/features/categories/queries";
import { getUserId } from "@/shared/lib/auth/server";
import { fetchOrSeedCostCentersForUser } from "@/shared/lib/cost-centers/queries";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const [categories, costCenters] = await Promise.all([
		fetchCategoriesForUser(userId),
		fetchOrSeedCostCentersForUser(userId),
	]);

	return (
		<main className="flex flex-col gap-6">
			<CategoriesPage categories={categories} costCenters={costCenters} />
		</main>
	);
}
