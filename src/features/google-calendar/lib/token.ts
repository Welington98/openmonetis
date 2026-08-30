import { eq } from "drizzle-orm";
import { googleCalendarConnections } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { refreshGoogleCalendarAccessToken } from "./google-calendar-client";

const EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

type ConnectionTokenFields = {
	id: string;
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: Date;
};

/**
 * Retorna um access token válido para a conexão, renovando via refresh token
 * e persistindo o novo valor quando estiver perto de expirar.
 */
export async function getValidAccessToken(
	connection: ConnectionTokenFields,
): Promise<string> {
	const expiresSoon =
		connection.accessTokenExpiresAt.getTime() - Date.now() <
		EXPIRY_SAFETY_MARGIN_MS;

	if (!expiresSoon) {
		return connection.accessToken;
	}

	const { accessToken, expiresAt } = await refreshGoogleCalendarAccessToken(
		connection.refreshToken,
	);

	await db
		.update(googleCalendarConnections)
		.set({ accessToken, accessTokenExpiresAt: expiresAt })
		.where(eq(googleCalendarConnections.id, connection.id));

	return accessToken;
}
