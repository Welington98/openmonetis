"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { cards, googleCalendarConnections, transactions } from "@/db/schema";
import { deleteDedicatedCalendar } from "@/features/google-calendar/lib/google-calendar-client";
import { getValidAccessToken } from "@/features/google-calendar/lib/token";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import { syncGoogleCalendarConnection } from "./lib/sync";

function revalidateGoogleCalendar(userId: string) {
	revalidateForEntity("googleCalendar", userId);
}

/**
 * Desconecta a integração: remove a agenda dedicada "OpenMonetis" no Google
 * (best-effort — se falhar, a conexão local é removida de qualquer forma,
 * já que o usuário pediu explicitamente pra desconectar) e apaga a conexão
 * local (cascade remove o mapeamento de eventos).
 */
export async function disconnectGoogleCalendarAction(): Promise<ActionResult> {
	try {
		const userId = await getUserId();

		const [connection] = await db
			.select()
			.from(googleCalendarConnections)
			.where(eq(googleCalendarConnections.userId, userId))
			.limit(1);

		if (!connection) {
			return {
				success: false,
				error: "Nenhuma conexão com o Google Agenda encontrada.",
			};
		}

		try {
			const accessToken = await getValidAccessToken(connection);
			await deleteDedicatedCalendar(accessToken, connection.googleCalendarId);
		} catch (error) {
			console.error(
				"[google-calendar] Falha ao remover agenda no Google:",
				error,
			);
		}

		await db
			.delete(googleCalendarConnections)
			.where(eq(googleCalendarConnections.id, connection.id));

		revalidateGoogleCalendar(userId);
		return { success: true, message: "Google Agenda desconectado." };
	} catch (error) {
		return handleActionError(error);
	}
}

/** Dispara uma sincronização sob demanda (fora do ciclo do cron). */
export async function triggerManualGoogleCalendarSyncAction(): Promise<
	ActionResult<{ created: number; updated: number; deleted: number }>
> {
	try {
		const userId = await getUserId();

		const [connection] = await db
			.select({ id: googleCalendarConnections.id })
			.from(googleCalendarConnections)
			.where(
				and(
					eq(googleCalendarConnections.userId, userId),
					eq(googleCalendarConnections.isActive, true),
				),
			)
			.limit(1);

		if (!connection) {
			return { success: false, error: "Google Agenda não está conectado." };
		}

		const result = await syncGoogleCalendarConnection(connection.id, userId);
		revalidateGoogleCalendar(userId);

		return {
			success: true,
			message: "Sincronização concluída.",
			data: result,
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			created: number;
			updated: number;
			deleted: number;
		}>;
	}
}

const toggleTransactionSyncSchema = z.object({
	transactionId: z.string().uuid("Lançamento inválido."),
	enabled: z.boolean(),
});

/** Liga/desliga se um lançamento específico deve aparecer no Google Agenda. */
export async function toggleTransactionCalendarSyncAction(
	input: z.infer<typeof toggleTransactionSyncSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const { transactionId, enabled } = toggleTransactionSyncSchema.parse(input);

		const [updated] = await db
			.update(transactions)
			.set({ syncToGoogleCalendar: enabled })
			.where(
				and(
					eq(transactions.id, transactionId),
					eq(transactions.userId, userId),
				),
			)
			.returning({ id: transactions.id });

		if (!updated) {
			return { success: false, error: "Lançamento não encontrado." };
		}

		revalidateGoogleCalendar(userId);
		return {
			success: true,
			message: enabled
				? "Lançamento voltará a aparecer no Google Agenda."
				: "Lançamento não aparecerá mais no Google Agenda.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

const toggleCardSyncSchema = z.object({
	cardId: z.string().uuid("Cartão inválido."),
	enabled: z.boolean(),
});

/** Liga/desliga se o vencimento de fatura de um cartão deve aparecer no Google Agenda. */
export async function toggleCardCalendarSyncAction(
	input: z.infer<typeof toggleCardSyncSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const { cardId, enabled } = toggleCardSyncSchema.parse(input);

		const [updated] = await db
			.update(cards)
			.set({ syncToGoogleCalendar: enabled })
			.where(and(eq(cards.id, cardId), eq(cards.userId, userId)))
			.returning({ id: cards.id });

		if (!updated) {
			return { success: false, error: "Cartão não encontrado." };
		}

		revalidateGoogleCalendar(userId);
		return {
			success: true,
			message: enabled
				? "Vencimento da fatura voltará a aparecer no Google Agenda."
				: "Vencimento da fatura não aparecerá mais no Google Agenda.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}
