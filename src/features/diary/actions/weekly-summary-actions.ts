"use server";

import { dashboardNotificationStates } from "@/db/schema";
import { getIsoWeekLabel } from "@/features/diary/lib/weekly-summary";
import { DIARY_WEEKLY_SUMMARY_NOTIFICATION_KEY } from "@/features/diary/queries";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import { getBusinessDateString } from "@/shared/utils/date";

/**
 * Reutiliza a tabela compartilhada dashboard_notification_states (mesmo
 * mecanismo das notificações do dashboard) em vez de criar uma tabela nova:
 * o fingerprint da semana ISO atual muda toda semana, então o card volta a
 * aparecer automaticamente sem nenhuma infra adicional.
 */
export async function dismissWeeklySummaryAction(): Promise<ActionResult> {
	try {
		const user = await getUser();
		const fingerprint = getIsoWeekLabel(getBusinessDateString());
		const now = new Date();

		await db
			.insert(dashboardNotificationStates)
			.values({
				userId: user.id,
				notificationKey: DIARY_WEEKLY_SUMMARY_NOTIFICATION_KEY,
				fingerprint,
				readAt: now,
				archivedAt: null,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [
					dashboardNotificationStates.userId,
					dashboardNotificationStates.notificationKey,
				],
				set: {
					fingerprint,
					readAt: now,
					updatedAt: now,
				},
			});

		return { success: true, message: "Resumo semanal dispensado." };
	} catch (error) {
		return handleActionError(error);
	}
}
