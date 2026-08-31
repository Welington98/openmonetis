import { desc, eq } from "drizzle-orm";
import { apiTokens } from "@/db/schema";
import { db, schema } from "@/shared/lib/db";

interface UserPreferences {
	statementNoteAsColumn: boolean;
	transactionsColumnOrder: string[] | null;
	attachmentMaxSizeMb: number;
	showTransactionSummary: boolean;
	groupTransactionsByDate: boolean;
	hideAnticipatedInstallments: boolean;
	statementCategorizationMode: string;
}

interface ApiToken {
	id: string;
	name: string;
	tokenPrefix: string;
	lastUsedAt: Date | null;
	lastUsedIp: string | null;
	createdAt: Date;
	expiresAt: Date | null;
	revokedAt: Date | null;
}

/**
 * Um usuário pode ter mais de uma linha em `account` (senha local + Google
 * vinculado). "credential" tem prioridade sempre que existir — é o que
 * determina se as telas de trocar senha/e-mail mostram os campos de senha;
 * só volta "google" quando o usuário não tem senha local nenhuma.
 */
async function fetchAuthProvider(userId: string): Promise<string> {
	const userAccounts = await db.query.account.findMany({
		where: eq(schema.account.userId, userId),
		columns: { providerId: true },
	});
	if (userAccounts.some((account) => account.providerId === "credential")) {
		return "credential";
	}
	return userAccounts[0]?.providerId || "credential";
}

export async function fetchUserPreferences(
	userId: string,
): Promise<UserPreferences | null> {
	const result = await db
		.select({
			statementNoteAsColumn: schema.userPreferences.statementNoteAsColumn,
			transactionsColumnOrder: schema.userPreferences.transactionsColumnOrder,
			attachmentMaxSizeMb: schema.userPreferences.attachmentMaxSizeMb,
			showTransactionSummary: schema.userPreferences.showTransactionSummary,
			groupTransactionsByDate: schema.userPreferences.groupTransactionsByDate,
			hideAnticipatedInstallments:
				schema.userPreferences.hideAnticipatedInstallments,
			statementCategorizationMode:
				schema.userPreferences.statementCategorizationMode,
		})
		.from(schema.userPreferences)
		.where(eq(schema.userPreferences.userId, userId))
		.limit(1);

	if (!result[0]) return null;

	return result[0];
}

export async function fetchStatementCategorizationMode(
	userId: string,
): Promise<"manual" | "ai"> {
	const [row] = await db
		.select({
			mode: schema.userPreferences.statementCategorizationMode,
		})
		.from(schema.userPreferences)
		.where(eq(schema.userPreferences.userId, userId))
		.limit(1);

	return row?.mode === "ai" ? "ai" : "manual";
}

async function fetchApiTokens(userId: string): Promise<ApiToken[]> {
	return db
		.select({
			id: apiTokens.id,
			name: apiTokens.name,
			tokenPrefix: apiTokens.tokenPrefix,
			lastUsedAt: apiTokens.lastUsedAt,
			lastUsedIp: apiTokens.lastUsedIp,
			createdAt: apiTokens.createdAt,
			expiresAt: apiTokens.expiresAt,
			revokedAt: apiTokens.revokedAt,
		})
		.from(apiTokens)
		.where(eq(apiTokens.userId, userId))
		.orderBy(desc(apiTokens.createdAt));
}

export async function fetchSettingsPageData(userId: string) {
	const [authProvider, userPreferences, userApiTokens] = await Promise.all([
		fetchAuthProvider(userId),
		fetchUserPreferences(userId),
		fetchApiTokens(userId),
	]);

	return {
		authProvider,
		userPreferences,
		userApiTokens,
	};
}
