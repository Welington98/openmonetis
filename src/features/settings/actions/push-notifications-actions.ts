"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { pushSubscriptions } from "@/db/schema";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { isPushSubscriptionsTableMissing } from "@/shared/lib/notifications/is-table-missing";
import { sendPushToUser } from "@/shared/lib/push/send-push";
import type { ActionResult } from "@/shared/lib/types/actions";

const subscribeSchema = z.object({
	endpoint: z.string().trim().url("Endpoint de push inválido."),
	keys: z.object({
		p256dh: z.string().trim().min(1, "Chave p256dh ausente."),
		auth: z.string().trim().min(1, "Chave auth ausente."),
	}),
});

const unsubscribeSchema = z.object({
	endpoint: z.string().trim().url("Endpoint de push inválido."),
});

const MIGRATION_PENDING_MESSAGE =
	"A migration das notificações push ainda não foi aplicada. Rode pnpm run db:migrate para ativar.";

export async function subscribeToPushAction(
	input: z.infer<typeof subscribeSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = subscribeSchema.parse(input);
		const requestHeaders = await headers();
		const userAgent = requestHeaders.get("user-agent");

		await db
			.insert(pushSubscriptions)
			.values({
				userId: user.id,
				endpoint: data.endpoint,
				p256dh: data.keys.p256dh,
				auth: data.keys.auth,
				userAgent,
			})
			.onConflictDoUpdate({
				target: pushSubscriptions.endpoint,
				set: {
					userId: user.id,
					p256dh: data.keys.p256dh,
					auth: data.keys.auth,
					userAgent,
				},
			});

		return { success: true, message: "Notificações push ativadas." };
	} catch (error) {
		if (isPushSubscriptionsTableMissing(error)) {
			return { success: false, error: MIGRATION_PENDING_MESSAGE };
		}
		return handleActionError(error);
	}
}

export async function unsubscribeFromPushAction(
	input: z.infer<typeof unsubscribeSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = unsubscribeSchema.parse(input);

		await db
			.delete(pushSubscriptions)
			.where(
				and(
					eq(pushSubscriptions.userId, user.id),
					eq(pushSubscriptions.endpoint, data.endpoint),
				),
			);

		return { success: true, message: "Notificações push desativadas." };
	} catch (error) {
		if (isPushSubscriptionsTableMissing(error)) {
			return { success: false, error: MIGRATION_PENDING_MESSAGE };
		}
		return handleActionError(error);
	}
}

export async function sendTestPushNotificationAction(): Promise<ActionResult> {
	try {
		const user = await getUser();
		const { sent } = await sendPushToUser(user.id, {
			title: "OpenMonetis",
			body: "Notificação de teste — se você está vendo isso, o push funciona! 🎉",
			url: "/dashboard",
		});

		if (sent === 0) {
			return {
				success: false,
				error:
					"Nenhuma notificação foi enviada. Verifique se as chaves VAPID estão configuradas e se você tem uma inscrição ativa.",
			};
		}

		return { success: true, message: "Notificação de teste enviada." };
	} catch (error) {
		return handleActionError(error);
	}
}
