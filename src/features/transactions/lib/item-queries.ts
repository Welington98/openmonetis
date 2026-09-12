import { and, eq } from "drizzle-orm";
import { categories, costCenters, transactionItems } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { safeToNumber as toNumber } from "@/shared/utils/number";

export type TransactionItemListItem = {
	id: string;
	name: string;
	categoryId: string;
	categoryName: string;
	costCenterId: string | null;
	costCenterName: string | null;
	amount: number;
};

export async function fetchTransactionItems(
	userId: string,
	transactionId: string,
): Promise<TransactionItemListItem[]> {
	const rows = await db
		.select({
			id: transactionItems.id,
			name: transactionItems.name,
			categoryId: transactionItems.categoryId,
			categoryName: categories.name,
			costCenterId: transactionItems.costCenterId,
			costCenterName: costCenters.name,
			amount: transactionItems.amount,
		})
		.from(transactionItems)
		.innerJoin(categories, eq(transactionItems.categoryId, categories.id))
		.leftJoin(costCenters, eq(transactionItems.costCenterId, costCenters.id))
		.where(
			and(
				eq(transactionItems.transactionId, transactionId),
				eq(transactionItems.userId, userId),
			),
		)
		.orderBy(transactionItems.createdAt);

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		categoryId: row.categoryId,
		categoryName: row.categoryName,
		costCenterId: row.costCenterId,
		costCenterName: row.costCenterName,
		amount: toNumber(row.amount),
	}));
}
