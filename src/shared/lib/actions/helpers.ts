import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

export type { ActionResult } from "@/shared/lib/types/actions";

import type { ActionResult } from "@/shared/lib/types/actions";
import { errorResult } from "@/shared/lib/types/actions";

/**
 * Handles errors in server actions consistently
 * @param error - The error to handle
 * @returns ActionResult with error message
 */
export function handleActionError(error: unknown): ActionResult {
	if (error instanceof z.ZodError) {
		return errorResult(error.issues[0]?.message ?? "Dados inválidos.");
	}

	console.error("[ActionError]", error);
	return errorResult("Ocorreu um erro inesperado. Tente novamente.");
}

/**
 * Configuration for revalidation after mutations
 */
const revalidateConfig = {
	cards: ["/cards", "/accounts", "/transactions"],
	accounts: ["/accounts", "/transactions"],
	categories: ["/categories"],
	establishments: ["/reports/establishments", "/transactions"],
	budgets: ["/budgets"],
	savingsGoals: ["/savings-goals"],
	payers: ["/payers"],
	notes: ["/notes", "/notes/archived", "/dashboard"],
	notifications: ["/dashboard"],
	transactions: ["/transactions", "/accounts", "/attachments"],
	inbox: ["/inbox", "/transactions", "/dashboard"],
	attachments: ["/attachments"],
	bankSync: ["/bank-sync", "/accounts", "/transactions"],
	diary: [
		"/diary",
		"/diary/calendar",
		"/diary/achievements",
		"/dashboard",
		"/settings",
	],
	googleCalendar: ["/settings", "/calendar"],
	dailyBudget: ["/daily-budget", "/diary", "/dashboard"],
} as const;

/** Entities whose mutations should invalidate the dashboard cache */
const DASHBOARD_ENTITIES: ReadonlySet<string> = new Set([
	"transactions",
	"accounts",
	"cards",
	"budgets",
	"savingsGoals",
	"payers",
	"notes",
	"notifications",
	"inbox",
	"recurring",
	"bankSync",
	"diary",
	"dailyBudget",
]);

/**
 * Revalidates paths for a specific entity.
 * Also invalidates the user-scoped dashboard cache tag for financial entities.
 * @param entity - The entity type
 */
export function revalidateForEntity(
	entity: keyof typeof revalidateConfig,
	userId: string,
): void {
	revalidateConfig[entity].forEach((path) => revalidatePath(path));

	// Invalidate dashboard cache for financial mutations.
	if (DASHBOARD_ENTITIES.has(entity)) {
		revalidateTag(`dashboard-${userId}`, "max");
	}
}
