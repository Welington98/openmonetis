import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { googleCalendarConnections } from "@/db/schema";
import {
	createDedicatedCalendar,
	deleteDedicatedCalendar,
	exchangeGoogleCalendarCode,
} from "@/features/google-calendar/lib/google-calendar-client";
import { verifyOAuthState } from "@/features/google-calendar/lib/state";
import { getValidAccessToken } from "@/features/google-calendar/lib/token";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

/**
 * GET /api/integrations/google-calendar/callback
 *
 * Recebe o `code` do consentimento do Google, troca por tokens, cria a
 * agenda dedicada "OpenMonetis" e salva a conexão. Se o usuário já tinha uma
 * conexão anterior, a agenda antiga é removida antes de criar a nova (evita
 * agendas "OpenMonetis" órfãs duplicadas no Google do usuário).
 */
export async function GET(request: Request) {
	const userId = await getUserId();
	const { searchParams } = new URL(request.url);

	const error = searchParams.get("error");
	if (error) {
		return NextResponse.redirect(
			new URL(`/settings?googleCalendar=error`, request.url),
		);
	}

	const code = searchParams.get("code");
	const state = searchParams.get("state");
	const verifiedState = state ? verifyOAuthState(state) : null;

	if (!code || !verifiedState || verifiedState.userId !== userId) {
		return NextResponse.redirect(
			new URL(`/settings?googleCalendar=error`, request.url),
		);
	}

	try {
		const [existing] = await db
			.select()
			.from(googleCalendarConnections)
			.where(eq(googleCalendarConnections.userId, userId))
			.limit(1);

		if (existing) {
			try {
				const oldAccessToken = await getValidAccessToken(existing);
				await deleteDedicatedCalendar(
					oldAccessToken,
					existing.googleCalendarId,
				);
			} catch (cleanupError) {
				console.error(
					"[google-calendar-callback] Falha ao remover agenda antiga:",
					cleanupError,
				);
			}
		}

		const tokens = await exchangeGoogleCalendarCode(code);
		if (!tokens.refreshToken && !existing) {
			// Sem refresh_token e sem conexão anterior pra reaproveitar — o Google
			// só emite refresh_token na primeira autorização (ou com prompt=consent,
			// que já forçamos). Sem ele não dá pra manter a conexão viva.
			throw new Error("Google não retornou refresh_token.");
		}

		const googleCalendarId = await createDedicatedCalendar(tokens.accessToken);

		await db
			.insert(googleCalendarConnections)
			.values({
				userId,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken ?? existing?.refreshToken ?? "",
				accessTokenExpiresAt: tokens.expiresAt,
				googleCalendarId,
				status: "active",
				isActive: true,
			})
			.onConflictDoUpdate({
				target: googleCalendarConnections.userId,
				set: {
					accessToken: tokens.accessToken,
					refreshToken: tokens.refreshToken ?? existing?.refreshToken ?? "",
					accessTokenExpiresAt: tokens.expiresAt,
					googleCalendarId,
					status: "active",
					isActive: true,
				},
			});

		return NextResponse.redirect(
			new URL(`/settings?googleCalendar=success`, request.url),
		);
	} catch (connectError) {
		console.error(
			"[google-calendar-callback] Falha ao conectar:",
			connectError,
		);
		return NextResponse.redirect(
			new URL(`/settings?googleCalendar=error`, request.url),
		);
	}
}
