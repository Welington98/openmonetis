/**
 * Cliente mínimo da Google Calendar API v3 (https://developers.google.com/calendar/api/v3/reference)
 * + endpoint OAuth2 do Google (https://developers.google.com/identity/protocols/oauth2/web-server).
 *
 * Reaproveita GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET já usados pelo login social
 * (better-auth) — o mesmo client OAuth do Google Console pode pedir escopos
 * diferentes em fluxos diferentes, então este módulo não precisa de
 * credenciais próprias. Sem GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET configurados,
 * toda função aqui lança GoogleCalendarNotConfiguredError.
 */

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

// Escopo amplo (não o mais restrito `calendar.events`) porque este módulo
// cria e gerencia uma agenda secundária dedicada ("OpenMonetis") — criar/
// deletar agendas exige `calendar`, não só `calendar.events`.
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

export class GoogleCalendarNotConfiguredError extends Error {
	constructor() {
		super(
			"GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados. Configure-os no .env para habilitar a integração com o Google Agenda.",
		);
		this.name = "GoogleCalendarNotConfiguredError";
	}
}

export class GoogleCalendarApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
		this.name = "GoogleCalendarApiError";
	}
}

export function isGoogleCalendarConfigured(): boolean {
	return Boolean(
		process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
	);
}

function requireGoogleCredentials(): {
	clientId: string;
	clientSecret: string;
} {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new GoogleCalendarNotConfiguredError();
	}
	return { clientId, clientSecret };
}

function requireBaseUrl(): string {
	return process.env.BETTER_AUTH_URL || "http://localhost:3000";
}

/** Redirect URI registrada no Google Console para esta integração. */
export function getGoogleCalendarRedirectUri(): string {
	return `${requireBaseUrl()}/api/integrations/google-calendar/callback`;
}

/** Monta a URL de consentimento do Google para iniciar a conexão. */
export function buildGoogleCalendarAuthUrl(state: string): string {
	const { clientId } = requireGoogleCredentials();
	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: getGoogleCalendarRedirectUri(),
		response_type: "code",
		scope: GOOGLE_CALENDAR_SCOPE,
		access_type: "offline",
		prompt: "consent",
		state,
	});
	return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
}

type GoogleTokenResponse = {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
	scope: string;
};

async function googleOAuthFetch(
	body: Record<string, string>,
): Promise<GoogleTokenResponse> {
	const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(body).toString(),
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new GoogleCalendarApiError(
			`Google OAuth token endpoint ${response.status}: ${text.slice(0, 500)}`,
			response.status,
		);
	}

	return response.json() as Promise<GoogleTokenResponse>;
}

export type GoogleCalendarTokens = {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: Date;
};

/** Troca o `code` do callback OAuth pelos tokens iniciais (inclui refresh_token). */
export async function exchangeGoogleCalendarCode(
	code: string,
): Promise<GoogleCalendarTokens> {
	const { clientId, clientSecret } = requireGoogleCredentials();
	const data = await googleOAuthFetch({
		code,
		client_id: clientId,
		client_secret: clientSecret,
		redirect_uri: getGoogleCalendarRedirectUri(),
		grant_type: "authorization_code",
	});

	return {
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? null,
		expiresAt: new Date(Date.now() + data.expires_in * 1000),
	};
}

/** Renova o access token a partir do refresh token salvo. */
export async function refreshGoogleCalendarAccessToken(
	refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
	const { clientId, clientSecret } = requireGoogleCredentials();
	const data = await googleOAuthFetch({
		refresh_token: refreshToken,
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: "refresh_token",
	});

	return {
		accessToken: data.access_token,
		expiresAt: new Date(Date.now() + data.expires_in * 1000),
	};
}

async function calendarFetch<T>(
	accessToken: string,
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${GOOGLE_CALENDAR_BASE_URL}${path}`, {
		...init,
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
			...init.headers,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new GoogleCalendarApiError(
			`Google Calendar API ${response.status} em ${path}: ${body.slice(0, 500)}`,
			response.status,
		);
	}

	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

const DEDICATED_CALENDAR_SUMMARY = "OpenMonetis";
const DEDICATED_CALENDAR_DESCRIPTION =
	"Vencimentos e lançamentos financeiros sincronizados automaticamente pelo OpenMonetis.";

/** POST /calendars — cria a agenda secundária dedicada usada por esta integração. */
export async function createDedicatedCalendar(
	accessToken: string,
): Promise<string> {
	const calendar = await calendarFetch<{ id: string }>(
		accessToken,
		"/calendars",
		{
			method: "POST",
			body: JSON.stringify({
				summary: DEDICATED_CALENDAR_SUMMARY,
				description: DEDICATED_CALENDAR_DESCRIPTION,
				timeZone: "America/Sao_Paulo",
			}),
		},
	);
	return calendar.id;
}

/** DELETE /calendars/{id} — remove a agenda dedicada ao desconectar a integração. */
export async function deleteDedicatedCalendar(
	accessToken: string,
	calendarId: string,
): Promise<void> {
	await calendarFetch<void>(
		accessToken,
		`/calendars/${encodeURIComponent(calendarId)}`,
		{ method: "DELETE" },
	);
}

export type GoogleCalendarEventInput = {
	title: string;
	description?: string;
	date: string; // YYYY-MM-DD — evento de dia inteiro
};

export type GoogleCalendarEvent = { id: string };

/** POST /calendars/{calendarId}/events */
export async function insertCalendarEvent(
	accessToken: string,
	calendarId: string,
	event: GoogleCalendarEventInput,
): Promise<GoogleCalendarEvent> {
	return calendarFetch<GoogleCalendarEvent>(
		accessToken,
		`/calendars/${encodeURIComponent(calendarId)}/events`,
		{
			method: "POST",
			body: JSON.stringify({
				summary: event.title,
				description: event.description,
				start: { date: event.date },
				end: { date: event.date },
			}),
		},
	);
}

/** PATCH /calendars/{calendarId}/events/{eventId} */
export async function updateCalendarEvent(
	accessToken: string,
	calendarId: string,
	eventId: string,
	event: GoogleCalendarEventInput,
): Promise<GoogleCalendarEvent> {
	return calendarFetch<GoogleCalendarEvent>(
		accessToken,
		`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		{
			method: "PATCH",
			body: JSON.stringify({
				summary: event.title,
				description: event.description,
				start: { date: event.date },
				end: { date: event.date },
			}),
		},
	);
}

/** DELETE /calendars/{calendarId}/events/{eventId} — 404/410 tratados como já removido. */
export async function deleteCalendarEvent(
	accessToken: string,
	calendarId: string,
	eventId: string,
): Promise<void> {
	try {
		await calendarFetch<void>(
			accessToken,
			`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
			{ method: "DELETE" },
		);
	} catch (error) {
		if (
			error instanceof GoogleCalendarApiError &&
			(error.status === 404 || error.status === 410)
		) {
			return;
		}
		throw error;
	}
}
