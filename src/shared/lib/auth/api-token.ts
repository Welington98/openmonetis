import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { apiTokens } from "@/db/schema";
import { db } from "@/shared/lib/db";

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
	return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Extract bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	return match ? match[1] : null;
}

/**
 * Valida um token pessoal `opm_xxx` (criado em Configurações → Tokens de API)
 * e retorna o usuário dono dele. Usado por integrações externas (inbox,
 * servidor MCP) que autenticam via Bearer token em vez de sessão de cookie.
 *
 * Atualiza `lastUsedAt`/`lastUsedIp` como efeito colateral quando o token é
 * válido, para o usuário conseguir ver o último uso em Configurações.
 */
export async function verifyOpmApiToken(
	token: string,
	clientIp: string | null = null,
): Promise<{ userId: string; tokenId: string } | null> {
	if (!token.startsWith("opm_")) return null;

	const tokenHash = hashToken(token);

	const tokenRecord = await db.query.apiTokens.findFirst({
		where: and(
			eq(apiTokens.tokenHash, tokenHash),
			isNull(apiTokens.revokedAt),
			gt(apiTokens.expiresAt, new Date()),
		),
	});

	if (!tokenRecord) return null;

	await db
		.update(apiTokens)
		.set({ lastUsedAt: new Date(), lastUsedIp: clientIp })
		.where(eq(apiTokens.id, tokenRecord.id));

	return { userId: tokenRecord.userId, tokenId: tokenRecord.id };
}
