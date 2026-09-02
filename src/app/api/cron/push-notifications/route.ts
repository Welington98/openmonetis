import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { dashboardNotificationStates, pushSubscriptions } from "@/db/schema";
import { fetchDashboardNotifications } from "@/features/dashboard/notifications/notifications-queries";
import { db } from "@/shared/lib/db";
import { isPushSubscriptionsTableMissing } from "@/shared/lib/notifications/is-table-missing";
import {
	type PushNotificationPayload,
	sendPushToUser,
} from "@/shared/lib/push/send-push";
import type {
	BudgetNotification,
	DashboardNotification,
} from "@/shared/lib/types/notifications";
import { formatCurrency } from "@/shared/utils/currency";
import { getBusinessDateString } from "@/shared/utils/date";

function buildInvoiceOrBoletoPayload(
	notification: DashboardNotification,
): PushNotificationPayload {
	const kind = notification.type === "invoice" ? "Fatura" : "Boleto";
	const verb =
		notification.status === "overdue" ? "vencida(o)" : "vence em breve";
	const amount = notification.showAmount
		? ` — ${formatCurrency(notification.amount)}`
		: "";

	return {
		title: `${kind} ${verb}`,
		body: `${notification.name}${amount} (${notification.dueDate})`,
		url: notification.href,
		tag: notification.notificationKey,
	};
}

function buildBudgetPayload(
	notification: BudgetNotification,
): PushNotificationPayload {
	const title =
		notification.status === "exceeded"
			? "Orçamento estourado"
			: "Orçamento quase no limite";

	return {
		title,
		body: `${notification.categoryName}: ${Math.round(notification.usedPercentage)}% de ${formatCurrency(notification.budgetAmount)} usado`,
		url: notification.href,
		tag: notification.notificationKey,
	};
}

async function fetchAlreadyPushedKeys(
	userId: string,
	notificationKeys: string[],
): Promise<Set<string>> {
	if (notificationKeys.length === 0) {
		return new Set();
	}

	const rows = await db
		.select({ notificationKey: dashboardNotificationStates.notificationKey })
		.from(dashboardNotificationStates)
		.where(
			and(
				eq(dashboardNotificationStates.userId, userId),
				isNotNull(dashboardNotificationStates.pushedAt),
				inArray(dashboardNotificationStates.notificationKey, notificationKeys),
			),
		);

	return new Set(rows.map((row) => row.notificationKey));
}

async function markAsPushed(
	userId: string,
	notificationKey: string,
	fingerprint: string,
) {
	const now = new Date();
	await db
		.insert(dashboardNotificationStates)
		.values({ userId, notificationKey, fingerprint, pushedAt: now })
		.onConflictDoUpdate({
			target: [
				dashboardNotificationStates.userId,
				dashboardNotificationStates.notificationKey,
			],
			set: { fingerprint, pushedAt: now, updatedAt: now },
		});
}

async function processUser(userId: string) {
	const currentPeriod = getBusinessDateString().slice(0, 7);
	const snapshot = await fetchDashboardNotifications(userId, currentPeriod);

	const pendingInvoices = snapshot.notifications.filter(
		(n) => !n.isRead && !n.isArchived,
	);
	const pendingBudgets = snapshot.budgetNotifications.filter(
		(n) => !n.isRead && !n.isArchived,
	);

	const alreadyPushed = await fetchAlreadyPushedKeys(userId, [
		...pendingInvoices.map((n) => n.notificationKey),
		...pendingBudgets.map((n) => n.notificationKey),
	]);

	let sentCount = 0;

	for (const notification of pendingInvoices) {
		if (alreadyPushed.has(notification.notificationKey)) continue;
		const { sent } = await sendPushToUser(
			userId,
			buildInvoiceOrBoletoPayload(notification),
		);
		if (sent > 0) {
			sentCount += sent;
			await markAsPushed(
				userId,
				notification.notificationKey,
				notification.fingerprint,
			);
		}
	}

	for (const notification of pendingBudgets) {
		if (alreadyPushed.has(notification.notificationKey)) continue;
		const { sent } = await sendPushToUser(
			userId,
			buildBudgetPayload(notification),
		);
		if (sent > 0) {
			sentCount += sent;
			await markAsPushed(
				userId,
				notification.notificationKey,
				notification.fingerprint,
			);
		}
	}

	return sentCount;
}

/**
 * GET /api/cron/push-notifications
 *
 * Não há infraestrutura de cron/job dentro do processo Next.js standalone
 * deste projeto — esta rota existe para ser chamada periodicamente por um
 * agendador externo (Vercel Cron, cron do próprio host, GitHub Actions
 * schedule, etc.), configurado pelo usuário no deploy dele. Protegida por
 * `CRON_SECRET` via header Authorization.
 *
 * Envia notificações push (faturas/boletos vencendo, orçamentos estourados)
 * para usuários com inscrição ativa, evitando reenvio via `pushed_at`.
 */
export async function GET(request: Request) {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret) {
		return NextResponse.json(
			{ error: "CRON_SECRET não configurado no servidor." },
			{ status: 503 },
		);
	}

	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
	}

	try {
		let subscribedUserIds: string[];
		try {
			const rows = await db
				.selectDistinct({ userId: pushSubscriptions.userId })
				.from(pushSubscriptions);
			subscribedUserIds = rows.map((row) => row.userId);
		} catch (error) {
			if (isPushSubscriptionsTableMissing(error)) {
				return NextResponse.json({
					status: "ok",
					usersProcessed: 0,
					notificationsSent: 0,
				});
			}
			throw error;
		}

		let notificationsSent = 0;
		for (const userId of subscribedUserIds) {
			notificationsSent += await processUser(userId);
		}

		return NextResponse.json({
			status: "ok",
			usersProcessed: subscribedUserIds.length,
			notificationsSent,
		});
	} catch (error) {
		console.error("[push-notifications-cron] Falha inesperada:", error);
		return NextResponse.json(
			{ error: "Falha ao enviar notificações push." },
			{ status: 500 },
		);
	}
}
