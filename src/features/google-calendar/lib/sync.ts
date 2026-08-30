import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
	cards,
	googleCalendarConnections,
	googleCalendarSyncedEvents,
	transactions,
} from "@/db/schema";
import { fetchCalendarData } from "@/features/calendar/queries";
import { db } from "@/shared/lib/db";
import {
	getCurrentPeriod,
	getNextPeriod,
	getPreviousPeriod,
} from "@/shared/utils/period";
import {
	deleteCalendarEvent,
	type GoogleCalendarEventInput,
	insertCalendarEvent,
	updateCalendarEvent,
} from "./google-calendar-client";
import { getValidAccessToken } from "./token";

// Janela deslizante sincronizada a cada execução — eventos fora dela (muito no
// passado ou muito no futuro) são removidos do Google Agenda e recriados
// automaticamente quando entrarem na janela novamente. Reflete a natureza de
// "lembrete" da integração, não um histórico permanente.
const SYNC_WINDOW_MONTHS_BACK = 1;
const SYNC_WINDOW_MONTHS_FORWARD = 2;

type TargetEvent = {
	entityType: "transaction" | "boleto" | "card" | "installment";
	entityId: string;
	period: string;
	date: string;
	title: string;
	description: string;
};

export type GoogleCalendarSyncResult = {
	connectionId: string;
	created: number;
	updated: number;
	deleted: number;
};

function getSyncWindowPeriods(): string[] {
	let period = getCurrentPeriod();
	for (let i = 0; i < SYNC_WINDOW_MONTHS_BACK; i += 1) {
		period = getPreviousPeriod(period);
	}

	const periods: string[] = [];
	const totalMonths = SYNC_WINDOW_MONTHS_BACK + SYNC_WINDOW_MONTHS_FORWARD + 1;
	for (let i = 0; i < totalMonths; i += 1) {
		periods.push(period);
		period = getNextPeriod(period);
	}
	return periods;
}

function formatBRL(amount: number): string {
	return amount.toLocaleString("pt-BR", {
		style: "currency",
		currency: "BRL",
	});
}

function eventKey(
	entityType: string,
	entityId: string,
	period: string,
): string {
	return `${entityType}:${entityId}:${period}`;
}

function hashEvent(
	event: Pick<TargetEvent, "title" | "date" | "description">,
): string {
	return createHash("sha256")
		.update(`${event.title}|${event.date}|${event.description}`)
		.digest("hex");
}

function toEventInput(target: TargetEvent): GoogleCalendarEventInput {
	return {
		title: target.title,
		description: target.description,
		date: target.date,
	};
}

/**
 * Busca os eventos do calendário financeiro (mesma lógica exibida em
 * `/calendar`, via `fetchCalendarData`) para a janela de sincronização e
 * converte em `TargetEvent`s, respeitando a flag `syncToGoogleCalendar` de
 * cada lançamento/cartão.
 */
async function buildTargetEvents(userId: string): Promise<TargetEvent[]> {
	const periods = getSyncWindowPeriods();

	const [syncableTransactions, syncableCards] = await Promise.all([
		db
			.select({ id: transactions.id })
			.from(transactions)
			.where(
				and(
					eq(transactions.userId, userId),
					eq(transactions.syncToGoogleCalendar, true),
				),
			),
		db
			.select({ id: cards.id })
			.from(cards)
			.where(
				and(eq(cards.userId, userId), eq(cards.syncToGoogleCalendar, true)),
			),
	]);
	const syncableTransactionIds = new Set(
		syncableTransactions.map((row) => row.id),
	);
	const syncableCardIds = new Set(syncableCards.map((row) => row.id));

	const targets: TargetEvent[] = [];

	for (const period of periods) {
		const { events } = await fetchCalendarData({ userId, period });

		for (const event of events) {
			if (event.type === "card") {
				if (!syncableCardIds.has(event.card.id)) continue;
				const totalDue = event.card.totalDue ?? 0;
				targets.push({
					entityType: "card",
					entityId: event.card.id,
					period,
					date: event.date,
					title: `Fatura: ${event.card.name}`,
					description: `Total da fatura: ${formatBRL(totalDue)}`,
				});
				continue;
			}

			if (!syncableTransactionIds.has(event.transaction.id)) continue;

			const amountLabel = formatBRL(Math.abs(event.transaction.amount));

			if (event.type === "boleto") {
				targets.push({
					entityType: "boleto",
					entityId: event.transaction.id,
					period,
					date: event.date,
					title: `Boleto: ${event.transaction.name}`,
					description: `Valor: ${amountLabel}`,
				});
				continue;
			}

			if (event.type === "installment") {
				const entityId = event.transaction.seriesId ?? event.transaction.id;
				const current = event.transaction.currentInstallment;
				const total = event.installmentCount;
				const installmentLabel = current ? `${current}/${total}` : `${total}x`;
				targets.push({
					entityType: "installment",
					entityId,
					period,
					date: event.date,
					title: `Parcela ${installmentLabel}: ${event.transaction.name}`,
					description: `Valor da parcela: ${formatBRL(event.installmentValue)}`,
				});
				continue;
			}

			targets.push({
				entityType: "transaction",
				entityId: event.transaction.id,
				period,
				date: event.date,
				title: event.transaction.name,
				description: `Valor: ${amountLabel}`,
			});
		}
	}

	return targets;
}

/**
 * Sincroniza uma conexão com o Google Agenda: calcula os eventos-alvo pra
 * janela de sincronização e aplica o diff (cria/atualiza/remove) contra os
 * eventos já espelhados em `googleCalendarSyncedEvents`. Idempotente — chamadas
 * repetidas não duplicam nem recriam eventos sem necessidade.
 */
export async function syncGoogleCalendarConnection(
	connectionId: string,
	userId: string,
): Promise<GoogleCalendarSyncResult> {
	const [connection] = await db
		.select()
		.from(googleCalendarConnections)
		.where(
			and(
				eq(googleCalendarConnections.id, connectionId),
				eq(googleCalendarConnections.userId, userId),
			),
		)
		.limit(1);

	if (!connection) {
		throw new Error("Conexão com o Google Agenda não encontrada.");
	}

	const accessToken = await getValidAccessToken(connection);
	const targets = await buildTargetEvents(userId);

	const existingRows = await db
		.select()
		.from(googleCalendarSyncedEvents)
		.where(eq(googleCalendarSyncedEvents.connectionId, connectionId));
	const existingByKey = new Map(
		existingRows.map((row) => [
			eventKey(row.entityType, row.entityId, row.period),
			row,
		]),
	);

	const seenKeys = new Set<string>();
	let created = 0;
	let updated = 0;

	for (const target of targets) {
		const key = eventKey(target.entityType, target.entityId, target.period);
		seenKeys.add(key);
		const hash = hashEvent(target);
		const existing = existingByKey.get(key);

		if (existing) {
			if (existing.contentHash !== hash) {
				await updateCalendarEvent(
					accessToken,
					connection.googleCalendarId,
					existing.googleEventId,
					toEventInput(target),
				);
				await db
					.update(googleCalendarSyncedEvents)
					.set({ contentHash: hash, lastSyncedAt: new Date() })
					.where(eq(googleCalendarSyncedEvents.id, existing.id));
				updated += 1;
			}
			continue;
		}

		const inserted = await insertCalendarEvent(
			accessToken,
			connection.googleCalendarId,
			toEventInput(target),
		);
		await db
			.insert(googleCalendarSyncedEvents)
			.values({
				connectionId,
				userId,
				entityType: target.entityType,
				entityId: target.entityId,
				period: target.period,
				googleEventId: inserted.id,
				contentHash: hash,
			})
			.onConflictDoNothing();
		created += 1;
	}

	const staleRows = existingRows.filter(
		(row) => !seenKeys.has(eventKey(row.entityType, row.entityId, row.period)),
	);
	for (const row of staleRows) {
		await deleteCalendarEvent(
			accessToken,
			connection.googleCalendarId,
			row.googleEventId,
		);
		await db
			.delete(googleCalendarSyncedEvents)
			.where(eq(googleCalendarSyncedEvents.id, row.id));
	}

	await db
		.update(googleCalendarConnections)
		.set({ lastSyncedAt: new Date(), status: "active" })
		.where(eq(googleCalendarConnections.id, connectionId));

	return { connectionId, created, updated, deleted: staleRows.length };
}

/** Roda o sync para todas as conexões ativas de todos os usuários — usado pela rota de cron. */
export async function syncAllActiveGoogleCalendarConnections(): Promise<
	GoogleCalendarSyncResult[]
> {
	const activeConnections = await db
		.select({
			id: googleCalendarConnections.id,
			userId: googleCalendarConnections.userId,
		})
		.from(googleCalendarConnections)
		.where(eq(googleCalendarConnections.isActive, true));

	const results: GoogleCalendarSyncResult[] = [];
	for (const connection of activeConnections) {
		try {
			results.push(
				await syncGoogleCalendarConnection(connection.id, connection.userId),
			);
		} catch (error) {
			console.error(
				`[google-calendar-sync] Falha ao sincronizar conexão ${connection.id}:`,
				error,
			);
			await db
				.update(googleCalendarConnections)
				.set({ status: "error" })
				.where(eq(googleCalendarConnections.id, connection.id));
		}
	}
	return results;
}

/** Descreve a janela de sincronização (`YYYY-MM` → `YYYY-MM`) — usado em logs/mensagens. */
export function describeSyncWindow(): string {
	const periods = getSyncWindowPeriods();
	return `${periods[0]} → ${periods[periods.length - 1]}`;
}
