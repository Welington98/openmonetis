/**
 * Cliente mínimo da API do Pluggy (https://docs.pluggy.ai). Endpoints e shapes
 * confirmados contra a spec oficial da API (auth, connect_token, items,
 * accounts, v2/transactions) — não são especulativos.
 *
 * Sem PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET configurados, toda função aqui
 * lança PluggyNotConfiguredError. Quem chama decide como lidar com isso
 * (ex.: a rota de cron loga e sai sem quebrar o processo).
 */

const PLUGGY_BASE_URL = "https://api.pluggy.ai";

export class PluggyNotConfiguredError extends Error {
	constructor() {
		super(
			"PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET não configurados. Configure-os no .env para habilitar a sincronização bancária.",
		);
		this.name = "PluggyNotConfiguredError";
	}
}

export class PluggyApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
		this.name = "PluggyApiError";
	}
}

export function isPluggyConfigured(): boolean {
	return Boolean(
		process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET,
	);
}

function requirePluggyCredentials(): {
	clientId: string;
	clientSecret: string;
} {
	const clientId = process.env.PLUGGY_CLIENT_ID;
	const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new PluggyNotConfiguredError();
	}
	return { clientId, clientSecret };
}

async function pluggyFetch<T>(
	path: string,
	init: RequestInit & { apiKey?: string } = {},
): Promise<T> {
	const { apiKey, headers, ...rest } = init;
	const response = await fetch(`${PLUGGY_BASE_URL}${path}`, {
		...rest,
		headers: {
			"Content-Type": "application/json",
			...(apiKey ? { "X-API-KEY": apiKey } : {}),
			...headers,
		},
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new PluggyApiError(
			`Pluggy API ${response.status} em ${path}: ${body.slice(0, 500)}`,
			response.status,
		);
	}

	return response.json() as Promise<T>;
}

// Cache em memória do processo — a API Key do Pluggy expira em 2h.
let cachedApiKey: { value: string; expiresAt: number } | null = null;
const API_KEY_TTL_MS = 110 * 60 * 1000; // 110min, margem de segurança

/**
 * POST /auth — troca clientId/clientSecret por uma apiKey de curta duração.
 */
export async function getPluggyApiKey(): Promise<string> {
	if (cachedApiKey && cachedApiKey.expiresAt > Date.now()) {
		return cachedApiKey.value;
	}

	const { clientId, clientSecret } = requirePluggyCredentials();
	const { apiKey } = await pluggyFetch<{ apiKey: string }>("/auth", {
		method: "POST",
		body: JSON.stringify({ clientId, clientSecret }),
	});

	cachedApiKey = { value: apiKey, expiresAt: Date.now() + API_KEY_TTL_MS };
	return apiKey;
}

export type PluggyConnectTokenOptions = {
	itemId?: string;
	clientUserId?: string;
	webhookUrl?: string;
};

/**
 * POST /connect_token — token de curta duração usado só no client para
 * inicializar o widget Pluggy Connect (client id/secret nunca chegam ao browser).
 */
export async function createPluggyConnectToken(
	options: PluggyConnectTokenOptions = {},
): Promise<string> {
	const apiKey = await getPluggyApiKey();
	const { accessToken } = await pluggyFetch<{ accessToken: string }>(
		"/connect_token",
		{
			method: "POST",
			apiKey,
			body: JSON.stringify({
				itemId: options.itemId,
				options: {
					clientUserId: options.clientUserId,
					webhookUrl: options.webhookUrl,
				},
			}),
		},
	);
	return accessToken;
}

export type PluggyItem = {
	id: string;
	status: string;
	executionStatus: string;
	lastUpdatedAt: string | null;
	connector: { id: number; name: string };
};

/** GET /items/{id} */
export async function fetchPluggyItem(itemId: string): Promise<PluggyItem> {
	const apiKey = await getPluggyApiKey();
	return pluggyFetch<PluggyItem>(`/items/${itemId}`, { apiKey });
}

export type PluggyAccount = {
	id: string;
	type: "BANK" | "CREDIT";
	subtype: string;
	name: string;
	balance: number;
	itemId: string;
	currencyCode: string;
};

/** GET /accounts?itemId= */
export async function fetchPluggyAccounts(
	itemId: string,
): Promise<PluggyAccount[]> {
	const apiKey = await getPluggyApiKey();
	const { results } = await pluggyFetch<{ results: PluggyAccount[] }>(
		`/accounts?itemId=${encodeURIComponent(itemId)}`,
		{ apiKey },
	);
	return results;
}

export type PluggyTransaction = {
	id: string;
	description: string;
	amount: number;
	date: string;
	type: "DEBIT" | "CREDIT";
	accountId: string;
};

/**
 * GET /v2/transactions — pagina por cursor até esgotar `next`.
 * `dateFrom` no formato yyyy-mm-dd (opcional, usado no sync incremental).
 */
export async function fetchPluggyTransactions(
	accountId: string,
	options: { dateFrom?: string } = {},
): Promise<PluggyTransaction[]> {
	const apiKey = await getPluggyApiKey();
	const transactions: PluggyTransaction[] = [];

	const params = new URLSearchParams({ accountId });
	if (options.dateFrom) params.set("dateFrom", options.dateFrom);

	let path: string | null = `/v2/transactions?${params.toString()}`;
	while (path) {
		const page: { results: PluggyTransaction[]; next: string | null } =
			await pluggyFetch(path, { apiKey });
		transactions.push(...page.results);
		path = page.next ? `/v2/transactions${page.next}` : null;
	}

	return transactions;
}
