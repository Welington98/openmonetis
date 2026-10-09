import type { BaseContext, McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const mocks = vi.hoisted(() => ({
	fetchBankConnections: vi.fn(),
	fetchStatementLines: vi.fn(),
	fetchReconciliationOverview: vi.fn(),
	revalidateForEntity: vi.fn(),
	categoryFindFirst: vi.fn(),
	transactionFindFirst: vi.fn(),
	updateReturning: [] as unknown[],
	updated: [] as unknown[],
}));

vi.mock("@/features/bank-sync/queries", () => ({
	fetchBankConnections: mocks.fetchBankConnections,
	fetchStatementLines: mocks.fetchStatementLines,
	fetchReconciliationOverview: mocks.fetchReconciliationOverview,
}));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: mocks.revalidateForEntity,
}));
vi.mock("@/shared/lib/db", () => {
	const chain = (result: () => unknown) => {
		const builder: Record<string, unknown> = {};
		for (const m of ["where", "returning"]) {
			builder[m] = () => builder;
		}
		// biome-ignore lint/suspicious/noThenProperty: simula o query builder do Drizzle, que é awaitable
		builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
		return builder;
	};
	return {
		db: {
			query: {
				categories: { findFirst: mocks.categoryFindFirst },
				transactions: { findFirst: mocks.transactionFindFirst },
			},
			update: () => ({
				set: (v: unknown) => {
					mocks.updated.push(v);
					return chain(() => mocks.updateReturning);
				},
			}),
		},
	};
});

import { registerBankSyncTools } from "../../tools/bank-sync-tools";

type Handler = (
	args: Record<string, unknown>,
	ctx: BaseContext,
) => Promise<{ content: { text: string }[] }>;
type Registered = { schema: z.ZodType; handler: Handler };

function buildServer() {
	const tools = new Map<string, Registered>();
	const server = {
		registerTool: (
			name: string,
			config: { inputSchema: z.ZodType },
			handler: Handler,
		) => {
			tools.set(name, { schema: config.inputSchema, handler });
		},
	} as unknown as McpServer;
	registerBankSyncTools(server);
	return tools;
}

const readCtx = {
	http: { authInfo: { extra: { userId: "user-1" }, scopes: ["finance:read"] } },
} as unknown as BaseContext;
const writeCtx = {
	http: {
		authInfo: {
			extra: { userId: "user-1" },
			scopes: ["finance:read", "finance:write"],
		},
	},
} as unknown as BaseContext;
const anonCtx = {} as BaseContext;

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

async function call(
	tools: Map<string, Registered>,
	name: string,
	args: Record<string, unknown>,
	ctx: BaseContext,
) {
	const tool = tools.get(name);
	if (!tool) throw new Error(`tool ${name} não registrada`);
	const parsed = tool.schema.parse(args) as Record<string, unknown>;
	const result = await tool.handler(parsed, ctx);
	return JSON.parse(result.content[0]?.text ?? "null");
}

const READ_TOOLS = [
	"list_bank_connections",
	"list_statement_lines",
	"reconciliation_overview",
];
const WRITE_ARGS: Record<string, Record<string, unknown>> = {
	ignore_statement_line: { statementLineId: UUID },
	match_statement_line: { statementLineId: UUID, transactionId: UUID2 },
	set_statement_line_category: { statementLineId: UUID, categoryId: UUID2 },
};

describe("MCP tools — bank-sync", () => {
	let tools: Map<string, Registered>;
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.updated.length = 0;
		mocks.updateReturning = [{ id: UUID }];
		mocks.transactionFindFirst.mockResolvedValue({ id: UUID2 });
		mocks.categoryFindFirst.mockResolvedValue({ id: UUID2 });
		tools = buildServer();
	});

	it("registra todas as tools", () => {
		for (const name of [...READ_TOOLS, ...Object.keys(WRITE_ARGS)]) {
			expect(tools.has(name), name).toBe(true);
		}
	});

	it("tools de leitura rejeitam chamada sem autenticação", async () => {
		for (const name of READ_TOOLS) {
			await expect(call(tools, name, {}, anonCtx), name).rejects.toThrow(
				"Não autenticado.",
			);
		}
	});

	it("tools de escrita exigem finance:write", async () => {
		for (const [name, args] of Object.entries(WRITE_ARGS)) {
			await expect(call(tools, name, args, readCtx), name).rejects.toThrow(
				"finance:write",
			);
		}
		expect(mocks.updated).toHaveLength(0);
	});

	it("list_bank_connections não expõe o pluggyItemId", async () => {
		mocks.fetchBankConnections.mockResolvedValue([
			{
				id: "c1",
				pluggyItemId: "secret-item",
				connectorName: "Meu Nubank",
				officialConnectorName: "Nubank",
				status: "UPDATED",
				isActive: true,
				lastSyncedAt: new Date("2026-10-01T12:00:00Z"),
			},
		]);
		const out = await call(tools, "list_bank_connections", {}, readCtx);
		expect(mocks.fetchBankConnections).toHaveBeenCalledWith("user-1");
		expect(JSON.stringify(out)).not.toContain("secret-item");
		expect(out[0]).toMatchObject({ name: "Meu Nubank", isActive: true });
	});

	it("list_statement_lines usa o userId do token, filtra status e limita", async () => {
		mocks.fetchStatementLines.mockResolvedValue(
			Array.from({ length: 3 }, (_, i) => ({
				id: `l${i}`,
				date: new Date("2026-10-02T00:00:00Z"),
				description: "Mercado",
				amount: "12.50",
				type: "despesa",
				status: "unmatched",
				categoryId: null,
				categoryName: null,
				categorySource: null,
				linkedFinancialAccountId: "a1",
				linkedCardId: null,
				matchedTransactionId: null,
			})),
		);
		const out = await call(
			tools,
			"list_statement_lines",
			{ limit: 2 },
			readCtx,
		);
		expect(mocks.fetchStatementLines).toHaveBeenCalledWith(
			"user-1",
			"unmatched",
		);
		expect(out.total).toBe(3);
		expect(out.lines).toHaveLength(2);
		expect(out.lines[0]).toMatchObject({
			date: "2026-10-02",
			amount: 12.5,
			category: null,
		});
	});

	it("reconciliation_overview calcula a diferença para o saldo do banco", async () => {
		mocks.fetchReconciliationOverview.mockResolvedValue({
			pluggyConfigured: true,
			pendingInboxCount: 2,
			accounts: [
				{
					accountId: "a1",
					accountName: "Conta",
					connectorName: "Nubank",
					localBalance: 100,
					pluggyBalance: 120.5,
					pendingCount: 4,
				},
				{
					accountId: "a2",
					accountName: "Outra",
					connectorName: "Itaú",
					localBalance: 10,
					pluggyBalance: null,
					pendingCount: 0,
				},
			],
		});
		const out = await call(tools, "reconciliation_overview", {}, readCtx);
		expect(out.accounts[0].difference).toBe(20.5);
		expect(out.accounts[1].difference).toBeNull();
	});

	it("ignore_statement_line marca como ignorada e revalida", async () => {
		await call(
			tools,
			"ignore_statement_line",
			WRITE_ARGS.ignore_statement_line,
			writeCtx,
		);
		expect(mocks.updated).toEqual([{ status: "ignored" }]);
		expect(mocks.revalidateForEntity).toHaveBeenCalledWith(
			"bankSync",
			"user-1",
		);
	});

	it("ignore_statement_line falha quando a linha não é do usuário/pendente", async () => {
		mocks.updateReturning = [];
		await expect(
			call(
				tools,
				"ignore_statement_line",
				WRITE_ARGS.ignore_statement_line,
				writeCtx,
			),
		).rejects.toThrow("Linha não encontrada ou já tratada.");
		expect(mocks.revalidateForEntity).not.toHaveBeenCalled();
	});

	it("match_statement_line valida o dono do lançamento antes de vincular", async () => {
		mocks.transactionFindFirst.mockResolvedValue(undefined);
		await expect(
			call(
				tools,
				"match_statement_line",
				WRITE_ARGS.match_statement_line,
				writeCtx,
			),
		).rejects.toThrow("Lançamento não encontrado.");
		expect(mocks.updated).toHaveLength(0);

		mocks.transactionFindFirst.mockResolvedValue({ id: UUID2 });
		await call(
			tools,
			"match_statement_line",
			WRITE_ARGS.match_statement_line,
			writeCtx,
		);
		expect(mocks.updated).toEqual([
			{ status: "matched", matchedTransactionId: UUID2 },
		]);
	});

	it("set_statement_line_category valida a categoria e permite limpar", async () => {
		mocks.categoryFindFirst.mockResolvedValue(undefined);
		await expect(
			call(
				tools,
				"set_statement_line_category",
				WRITE_ARGS.set_statement_line_category,
				writeCtx,
			),
		).rejects.toThrow("Categoria não encontrada.");
		expect(mocks.updated).toHaveLength(0);

		mocks.categoryFindFirst.mockResolvedValue({ id: UUID2 });
		await call(
			tools,
			"set_statement_line_category",
			WRITE_ARGS.set_statement_line_category,
			writeCtx,
		);
		await call(
			tools,
			"set_statement_line_category",
			{ statementLineId: UUID, categoryId: null },
			writeCtx,
		);
		expect(mocks.updated).toEqual([
			{ categoryId: UUID2, categorySource: "manual" },
			{ categoryId: null, categorySource: null },
		]);
	});
});
