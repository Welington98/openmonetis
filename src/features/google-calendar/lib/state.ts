import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Assina o parâmetro `state` do fluxo OAuth (CSRF + amarra o callback ao
// usuário que iniciou a conexão) — mesmo esquema HMAC usado pelos tokens de
// upload de anexos (`features/*/actions/attachments.ts`).
const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = { userId: string; nonce: string; issuedAt: number };

function getStateSecret(): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new Error(
			"BETTER_AUTH_SECRET is required. Set it in your .env file.",
		);
	}
	return secret;
}

function base64UrlEncode(value: string): string {
	return Buffer.from(value)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function base64UrlDecode(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const pad = normalized.length % 4;
	const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
	return Buffer.from(padded, "base64").toString("utf8");
}

function sign(encodedPayload: string): string {
	return createHmac("sha256", getStateSecret())
		.update(encodedPayload)
		.digest("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

export function createOAuthState(userId: string): string {
	const payload: StatePayload = {
		userId,
		nonce: randomBytes(16).toString("hex"),
		issuedAt: Date.now(),
	};
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyOAuthState(state: string): { userId: string } | null {
	const [encodedPayload, signature] = state.split(".");
	if (!encodedPayload || !signature) return null;

	const expectedSignature = sign(encodedPayload);
	if (
		signature.length !== expectedSignature.length ||
		!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
	) {
		return null;
	}

	try {
		const payload = JSON.parse(base64UrlDecode(encodedPayload)) as StatePayload;
		if (Date.now() - payload.issuedAt > STATE_TTL_MS) return null;
		if (typeof payload.userId !== "string" || !payload.userId) return null;
		return { userId: payload.userId };
	} catch {
		return null;
	}
}
