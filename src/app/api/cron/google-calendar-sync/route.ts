import { NextResponse } from "next/server";
import { syncAllActiveGoogleCalendarConnections } from "@/features/google-calendar/lib/sync";

/**
 * GET /api/cron/google-calendar-sync
 *
 * Mesmo molde do `/api/cron/pluggy-sync`: sem infra de cron dentro do
 * processo Next.js standalone deste projeto — chamado periodicamente por um
 * agendador externo (Vercel Cron, cron do host, GitHub Actions schedule),
 * protegido por `CRON_SECRET` via header Authorization.
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
		const results = await syncAllActiveGoogleCalendarConnections();
		return NextResponse.json({
			status: "ok",
			connectionsSynced: results.length,
			eventsCreated: results.reduce(
				(total, result) => total + result.created,
				0,
			),
			eventsUpdated: results.reduce(
				(total, result) => total + result.updated,
				0,
			),
			eventsDeleted: results.reduce(
				(total, result) => total + result.deleted,
				0,
			),
		});
	} catch (error) {
		console.error("[google-calendar-sync-cron] Falha inesperada:", error);
		return NextResponse.json(
			{ error: "Falha ao sincronizar Google Agenda." },
			{ status: 500 },
		);
	}
}
