import { eq } from "drizzle-orm";
import webPush from "web-push";
import { pushSubscriptions } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { isPushSubscriptionsTableMissing } from "@/shared/lib/notifications/is-table-missing";

export type PushNotificationPayload = {
	title: string;
	body?: string;
	url?: string;
	icon?: string;
	tag?: string;
};

let vapidConfigured = false;

function configureVapid(): boolean {
	if (vapidConfigured) {
		return true;
	}

	const { VAPID_PRIVATE_KEY, VAPID_SUBJECT, NEXT_PUBLIC_VAPID_PUBLIC_KEY } =
		process.env;

	if (!VAPID_PRIVATE_KEY || !VAPID_SUBJECT || !NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
		return false;
	}

	webPush.setVapidDetails(
		VAPID_SUBJECT,
		NEXT_PUBLIC_VAPID_PUBLIC_KEY,
		VAPID_PRIVATE_KEY,
	);
	vapidConfigured = true;
	return true;
}

/** Indica se as variáveis de ambiente VAPID necessárias para push estão configuradas. */
export function isPushConfigured(): boolean {
	return configureVapid();
}

/**
 * Envia uma notificação push para todas as subscriptions ativas de um usuário.
 * Remove automaticamente subscriptions inválidas/expiradas (HTTP 404/410).
 */
export async function sendPushToUser(
	userId: string,
	payload: PushNotificationPayload,
): Promise<{ sent: number; removed: number }> {
	if (!configureVapid()) {
		return { sent: 0, removed: 0 };
	}

	let subscriptions: (typeof pushSubscriptions.$inferSelect)[];
	try {
		subscriptions = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, userId));
	} catch (error) {
		if (isPushSubscriptionsTableMissing(error)) {
			return { sent: 0, removed: 0 };
		}
		throw error;
	}

	let sent = 0;
	let removed = 0;
	const body = JSON.stringify(payload);

	await Promise.all(
		subscriptions.map(async (subscription) => {
			try {
				await webPush.sendNotification(
					{
						endpoint: subscription.endpoint,
						keys: {
							p256dh: subscription.p256dh,
							auth: subscription.auth,
						},
					},
					body,
				);
				sent += 1;
			} catch (error) {
				const statusCode =
					error instanceof webPush.WebPushError ? error.statusCode : null;

				if (statusCode === 404 || statusCode === 410) {
					await db
						.delete(pushSubscriptions)
						.where(eq(pushSubscriptions.id, subscription.id));
					removed += 1;
					return;
				}

				console.error(
					`[push] Falha ao enviar notificação para subscription ${subscription.id}:`,
					error,
				);
			}
		}),
	);

	return { sent, removed };
}
