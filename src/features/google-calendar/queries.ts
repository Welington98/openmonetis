import { eq } from "drizzle-orm";
import { cards, googleCalendarConnections, transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

export type GoogleCalendarConnectionStatus = {
	isConnected: boolean;
	status: string | null;
	lastSyncedAt: Date | null;
};

export async function fetchGoogleCalendarConnectionStatus(
	userId: string,
): Promise<GoogleCalendarConnectionStatus> {
	const [connection] = await db
		.select({
			status: googleCalendarConnections.status,
			isActive: googleCalendarConnections.isActive,
			lastSyncedAt: googleCalendarConnections.lastSyncedAt,
		})
		.from(googleCalendarConnections)
		.where(eq(googleCalendarConnections.userId, userId))
		.limit(1);

	if (!connection?.isActive) {
		return { isConnected: false, status: null, lastSyncedAt: null };
	}

	return {
		isConnected: true,
		status: connection.status,
		lastSyncedAt: connection.lastSyncedAt,
	};
}

export type GoogleCalendarToggleState = {
	isConnected: boolean;
	transactionSync: Record<string, boolean>;
	cardSync: Record<string, boolean>;
};

/**
 * Estado leve (só ids + flag) usado pra desenhar o toggle "aparece no Google
 * Agenda" por lançamento/cartão no calendário financeiro, sem precisar
 * carregar isso no tipo compartilhado `TransactionItem`.
 */
export async function fetchGoogleCalendarToggleState(
	userId: string,
): Promise<GoogleCalendarToggleState> {
	const { isConnected } = await fetchGoogleCalendarConnectionStatus(userId);

	if (!isConnected) {
		return { isConnected: false, transactionSync: {}, cardSync: {} };
	}

	const [transactionRows, cardRows] = await Promise.all([
		db
			.select({
				id: transactions.id,
				syncToGoogleCalendar: transactions.syncToGoogleCalendar,
			})
			.from(transactions)
			.where(eq(transactions.userId, userId)),
		db
			.select({
				id: cards.id,
				syncToGoogleCalendar: cards.syncToGoogleCalendar,
			})
			.from(cards)
			.where(eq(cards.userId, userId)),
	]);

	return {
		isConnected: true,
		transactionSync: Object.fromEntries(
			transactionRows.map((row) => [row.id, row.syncToGoogleCalendar]),
		),
		cardSync: Object.fromEntries(
			cardRows.map((row) => [row.id, row.syncToGoogleCalendar]),
		),
	};
}
