import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/db", () => ({ db: {} }));

import { buildAccountMovementsJoin } from "../balance-queries";

describe("buildAccountMovementsJoin", () => {
	const { sql: rendered, params } = new PgDialect().sqlToQuery(
		// biome-ignore lint/style/noNonNullAssertion: and() com argumentos fixos nunca é undefined
		buildAccountMovementsJoin("user-1")!,
	);

	it("não filtra por pagador: despesas de outros pagadores também mexem no saldo da conta", () => {
		expect(rendered).not.toContain("payer_id");
		expect(rendered).not.toContain("pagador_id");
	});

	it("filtra por usuário, conta e lançamentos realizados", () => {
		expect(rendered).toContain("conta_id");
		expect(rendered).toContain("user_id");
		expect(rendered).toMatch(/realizado|is_settled|settled/i);
		expect(params).toContain("user-1");
	});
});
