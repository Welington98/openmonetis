import type { BaseContext } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import {
	jsonResult,
	requireUserId,
	requireWriteScope,
	toDateOnly,
} from "../helpers";

function ctxWith(
	userId: unknown,
	scopes: string[] = ["finance:read"],
): BaseContext {
	return {
		http: { authInfo: { extra: { userId }, scopes } },
	} as unknown as BaseContext;
}

describe("requireUserId", () => {
	it("retorna o userId do token", () => {
		expect(requireUserId(ctxWith("user-1"))).toBe("user-1");
	});

	it("falha sem autenticação", () => {
		expect(() => requireUserId({} as BaseContext)).toThrow("Não autenticado.");
		expect(() => requireUserId(ctxWith(""))).toThrow("Não autenticado.");
		expect(() => requireUserId(ctxWith(42))).toThrow("Não autenticado.");
	});
});

describe("requireWriteScope", () => {
	it("exige finance:write", () => {
		expect(() => requireWriteScope(ctxWith("u"))).toThrow(
			"Token sem permissão de escrita",
		);
		expect(requireWriteScope(ctxWith("u", ["finance:write"]))).toBe("u");
	});
});

describe("toDateOnly / jsonResult", () => {
	it("formata datas como YYYY-MM-DD", () => {
		expect(toDateOnly(new Date("2026-03-05T12:00:00Z"))).toBe("2026-03-05");
		expect(toDateOnly("2026-03-05T00:00:00.000Z")).toBe("2026-03-05");
		expect(toDateOnly(null)).toBeNull();
	});

	it("serializa em content de texto", () => {
		const result = jsonResult({ a: 1 });
		expect(result.content[0]?.type).toBe("text");
		expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({ a: 1 });
	});
});
