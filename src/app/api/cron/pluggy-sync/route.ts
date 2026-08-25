import { NextResponse } from "next/server";
import { syncAllActiveConnections } from "@/features/bank-sync/lib/sync";

/**
 * GET /api/cron/pluggy-sync
 *
 * Não há infraestrutura de cron/job dentro do processo Next.js standalone
 * deste projeto — esta rota existe para ser chamada periodicamente por um
 * agendador externo (Vercel Cron, cron do próprio host, GitHub Actions
 * schedule, etc.), configurado pelo usuário no deploy dele. Protegida por
 * `CRON_SECRET` via header Authorization.
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
		const results = await syncAllActiveConnections();
		return NextResponse.json({
			status: "ok",
			connectionsSynced: results.length,
			statementLinesCreated: results.reduce(
				(total, result) => total + result.statementLinesCreated,
				0,
			),
		});
	} catch (error) {
		console.error("[pluggy-sync-cron] Falha inesperada:", error);
		return NextResponse.json(
			{ error: "Falha ao sincronizar conexões bancárias." },
			{ status: 500 },
		);
	}
}
