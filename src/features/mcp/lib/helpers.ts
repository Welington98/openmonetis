import type { BaseContext } from "@modelcontextprotocol/server";
import { z } from "zod";

export const periodSchema = z
	.string()
	.regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato esperado: YYYY-MM");

export const dateSchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD");

/**
 * O userId das tools vem SEMPRE do token Bearer verificado
 * (ctx.http.authInfo), nunca de argumentos da chamada.
 */
export function requireUserId(ctx: BaseContext): string {
	const userId = ctx.http?.authInfo?.extra?.userId;
	if (typeof userId !== "string" || !userId) {
		throw new Error("Não autenticado.");
	}
	return userId;
}

export function requireWriteScope(ctx: BaseContext): string {
	const userId = requireUserId(ctx);
	const scopes = ctx.http?.authInfo?.scopes ?? [];
	if (!scopes.includes("finance:write")) {
		throw new Error("Token sem permissão de escrita (finance:write).");
	}
	return userId;
}

export function jsonResult(data: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
	};
}

/** Serializa Date (ou string de data) como YYYY-MM-DD; null permanece null. */
export function toDateOnly(value: Date | string | null | undefined) {
	if (!value) return null;
	return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}
