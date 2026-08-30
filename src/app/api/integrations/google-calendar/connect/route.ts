import { NextResponse } from "next/server";
import {
	buildGoogleCalendarAuthUrl,
	isGoogleCalendarConfigured,
} from "@/features/google-calendar/lib/google-calendar-client";
import { createOAuthState } from "@/features/google-calendar/lib/state";
import { getUserId } from "@/shared/lib/auth/server";

/**
 * GET /api/integrations/google-calendar/connect
 *
 * Inicia o fluxo OAuth dedicado da integração com o Google Agenda (separado
 * do login) — redireciona pra tela de consentimento do Google pedindo o
 * escopo `calendar` (necessário pra criar a agenda dedicada "OpenMonetis").
 */
export async function GET() {
	const userId = await getUserId();

	if (!isGoogleCalendarConfigured()) {
		return NextResponse.json(
			{ error: "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados." },
			{ status: 503 },
		);
	}

	const state = createOAuthState(userId);
	return NextResponse.redirect(buildGoogleCalendarAuthUrl(state));
}
