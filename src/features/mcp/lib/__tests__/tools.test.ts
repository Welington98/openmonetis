import type { BaseContext, McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const mocks = vi.hoisted(() => ({
	fetchBudgetsForUser: vi.fn(),
	fetchAllCardsForUser: vi.fn(),
	fetchCardData: vi.fn(),
	fetchInvoiceData: vi.fn(),
	fetchCardTransactions: vi.fn(),
	fetchPayablesSnapshot: vi.fn(),
	fetchSavingsGoalsForUser: vi.fn(),
	fetchAccountCurrentBalance: vi.fn(),
	fetchInboxItemsPage: vi.fn(),
	fetchTransactionsPageWithRelations: vi.fn(),
	revalidateForEntity: vi.fn(),
	dbSelectResult: [] as unknown[],
	categoryFindFirst: vi.fn(),
	transactionFindFirst: vi.fn(),
	insertReturning: [] as unknown[],
	inserted: [] as unknown[],
	updated: [] as unknown[],
}));

vi.mock("@/features/budgets/queries", () => ({
	fetchBudgetsForUser: mocks.fetchBudgetsForUser,
}));
vi.mock("@/features/cards/queries", () => ({
	fetchAllCardsForUser: mocks.fetchAllCardsForUser,
}));
vi.mock("@/features/invoices/queries", () => ({
	fetchCardData: mocks.fetchCardData,
	fetchInvoiceData: mocks.fetchInvoiceData,
	fetchCardTransactions: mocks.fetchCardTransactions,
}));
vi.mock("@/features/payables/queries", () => ({
	fetchPayablesSnapshot: mocks.fetchPayablesSnapshot,
}));
vi.mock("@/features/savings-goals/queries", () => ({
	fetchSavingsGoalsForUser: mocks.fetchSavingsGoalsForUser,
	fetchAccountCurrentBalance: mocks.fetchAccountCurrentBalance,
}));
vi.mock("@/features/inbox/queries", () => ({
	fetchInboxItemsPage: mocks.fetchInboxItemsPage,
}));
vi.mock("@/features/transactions/queries", () => ({
	fetchTransactionsPageWithRelations: mocks.fetchTransactionsPageWithRelations,
}));
vi.mock("@/features/balances/queries", () => ({
	fetchBalanceProjection: vi.fn(),
}));
vi.mock("@/features/daily-budget/queries", () => ({
	fetchDailyBudgetOverview: vi.fn(),
}));
vi.mock("@/features/notes/queries", () => ({ fetchAllNotesForUser: vi.fn() }));
vi.mock("@/features/payers/queries", () => ({ fetchPayersForUser: vi.fn() }));
vi.mock("@/features/reports/lib/balance-sheet-queries", () => ({
	fetchBalanceSheetReport: vi.fn(),
}));
vi.mock("@/features/reports/lib/cards-report-queries", () => ({
	fetchCartoesReportData: vi.fn(),
}));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: mocks.revalidateForEntity,
}));
vi.mock("@/shared/lib/db", () => {
	const chain = (result: () => unknown) => {
		const builder: Record<string, unknown> = {};
		for (const m of [
			"from",
			"where",
			"limit",
			"set",
			"onConflictDoNothing",
			"returning",
		]) {
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
			select: () => chain(() => mocks.dbSelectResult),
			insert: () => ({
				values: (v: unknown) => {
					mocks.inserted.push(v);
					return chain(() => mocks.insertReturning);
				},
			}),
			update: () => ({
				set: (v: unknown) => {
					mocks.updated.push(v);
					return chain(() => []);
				},
			}),
		},
	};
});

import { registerReadTools } from "../../tools/read-tools";
import { registerWriteTools } from "../../tools/write-tools";

type Handler = (
	args: Record<string, unknown>,
	ctx: BaseContext,
) => Promise<{
	content: { text: string }[];
}>;
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
	registerReadTools(server);
	registerWriteTools(server);
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
	"list_budgets",
	"list_cards",
	"get_invoice",
	"list_payables",
	"get_daily_budget",
	"get_balance_projection",
	"list_savings_goals",
	"list_payers",
	"account_statement",
	"cards_report",
	"balance_sheet",
	"list_inbox",
	"list_notes",
];
const WRITE_TOOLS = [
	"create_category",
	"create_budget",
	"create_savings_goal",
	"process_inbox_item",
	"discard_inbox_item",
];

describe("MCP tools — registro e autorização", () => {
	let tools: Map<string, Registered>;
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.inserted.length = 0;
		mocks.updated.length = 0;
		mocks.dbSelectResult = [];
		mocks.insertReturning = [];
		tools = buildServer();
	});

	it("registra todas as tools esperadas", () => {
		for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
			expect(tools.has(name), name).toBe(true);
		}
	});

	it("tools de leitura rejeitam chamada sem autenticação", async () => {
		const minimalArgs: Record<string, Record<string, unknown>> = {
			get_invoice: { cardId: UUID },
			account_statement: { accountId: UUID },
		};
		for (const name of READ_TOOLS) {
			await expect(
				call(tools, name, minimalArgs[name] ?? {}, anonCtx),
				name,
			).rejects.toThrow("Não autenticado.");
		}
	});

	it("tools de escrita exigem finance:write", async () => {
		const minimalArgs: Record<string, Record<string, unknown>> = {
			create_category: { name: "X", type: "despesa" },
			create_budget: { categoryId: UUID, period: "2026-01", amount: 10 },
			create_savings_goal: {
				description: "Viagem",
				targetAmount: 100,
				startDate: "2026-01-01",
				targetDate: "2026-12-01",
				destinationAccountId: UUID,
			},
			process_inbox_item: { inboxItemId: UUID, transactionId: UUID2 },
			discard_inbox_item: { inboxItemId: UUID },
		};
		for (const name of WRITE_TOOLS) {
			await expect(
				call(tools, name, minimalArgs[name] ?? {}, readCtx),
				name,
			).rejects.toThrow("finance:write");
		}
		expect(mocks.inserted).toHaveLength(0);
		expect(mocks.updated).toHaveLength(0);
	});

	it("schemas não aceitam userId como argumento", () => {
		const parsed = tools
			.get("list_budgets")
			?.schema.parse({ period: "2026-01", userId: "outro" });
		expect(parsed).not.toHaveProperty("userId");
	});
});

describe("MCP tools — leitura", () => {
	let tools: Map<string, Registered>;
	beforeEach(() => {
		vi.clearAllMocks();
		tools = buildServer();
	});

	it("list_budgets usa o userId do token e calcula percentuais", async () => {
		mocks.fetchBudgetsForUser.mockResolvedValue({
			budgets: [
				{
					id: "b1",
					amount: 200,
					spent: 50,
					category: { id: "c1", name: "Mercado" },
				},
				{ id: "b2", amount: 0, spent: 10, category: null },
			],
		});
		const out = await call(
			tools,
			"list_budgets",
			{ period: "2026-02" },
			readCtx,
		);

		expect(mocks.fetchBudgetsForUser).toHaveBeenCalledWith("user-1", "2026-02");
		expect(out.totalBudget).toBe(200);
		expect(out.totalSpent).toBe(60);
		expect(out.budgets[0]).toMatchObject({
			remaining: 150,
			percentUsed: 25,
		});
		expect(out.budgets[1].percentUsed).toBeNull();
	});

	it("list_cards oculta arquivados por padrão", async () => {
		const card = (id: string) => ({
			id,
			name: id,
			brand: "visa",
			status: "ativo",
			closingDay: "5",
			dueDay: "12",
			limit: 1000,
			limitInUse: 300,
			limitAvailable: 700,
			currentInvoiceLabel: "Fatura fev.",
			currentInvoiceAmount: 300,
			currentInvoiceStatus: "pending",
			accountId: "a1",
			accountName: "Conta",
		});
		mocks.fetchAllCardsForUser.mockResolvedValue({
			activeCards: [card("ativo")],
			archivedCards: [card("arquivado")],
		});

		const base = await call(tools, "list_cards", {}, readCtx);
		expect(base.map((c: { id: string }) => c.id)).toEqual(["ativo"]);
		const all = await call(
			tools,
			"list_cards",
			{ includeArchived: true },
			readCtx,
		);
		expect(all).toHaveLength(2);
	});

	it("get_invoice falha para cartão de outro usuário / inexistente", async () => {
		mocks.fetchCardData.mockResolvedValue(undefined);
		await expect(
			call(tools, "get_invoice", { cardId: UUID }, readCtx),
		).rejects.toThrow("Cartão não encontrado.");
		expect(mocks.fetchCardData).toHaveBeenCalledWith("user-1", UUID);
		expect(mocks.fetchInvoiceData).not.toHaveBeenCalled();
	});

	it("get_invoice monta fatura com compras", async () => {
		mocks.fetchCardData.mockResolvedValue({
			id: UUID,
			name: "Nubank",
			closingDay: "5",
			dueDay: "12",
			limit: "1500.00",
		});
		mocks.fetchInvoiceData.mockResolvedValue({
			totalAmount: -120,
			invoiceStatus: "pending",
			paymentDate: null,
			amountPaid: null,
		});
		mocks.fetchCardTransactions.mockResolvedValue([
			{
				id: "t1",
				name: "Uber",
				amount: "-120.00",
				purchaseDate: new Date("2026-02-03T00:00:00Z"),
				installmentCount: 3,
				currentInstallment: 1,
				category: { name: "Transporte" },
			},
		]);
		const out = await call(
			tools,
			"get_invoice",
			{ cardId: UUID, period: "2026-02" },
			readCtx,
		);
		expect(out.card.limit).toBe(1500);
		expect(out.purchases[0]).toMatchObject({
			amount: -120,
			purchaseDate: "2026-02-03",
			installment: "1/3",
			category: "Transporte",
		});
	});

	it("list_payables soma totais e nomeia faturas pelo cartão", async () => {
		mocks.fetchPayablesSnapshot.mockResolvedValue({
			payables: [
				{
					kind: "transaction",
					id: "p1",
					dueDate: "2026-02-10",
					amount: 100,
					bill: { name: "Internet" },
				},
				{
					kind: "invoice",
					id: "p2",
					dueDate: "2026-02-12",
					amount: 300,
					invoice: { cardName: "Nubank" },
				},
			],
			receivables: [
				{
					kind: "transaction",
					id: "r1",
					dueDate: null,
					amount: 50,
					bill: { name: "Freela" },
				},
			],
		});
		const out = await call(tools, "list_payables", {}, readCtx);
		expect(out.totalPayable).toBe(400);
		expect(out.totalReceivable).toBe(50);
		expect(out.payables.map((p: { name: string }) => p.name)).toEqual([
			"Internet",
			"Nubank",
		]);
	});

	it("account_statement sempre filtra por usuário e conta", async () => {
		mocks.fetchTransactionsPageWithRelations.mockResolvedValue({
			rows: [
				{
					id: "t1",
					name: "Mercado",
					amount: "-20.50",
					transactionType: "Despesa",
					purchaseDate: new Date("2026-02-01T00:00:00Z"),
					isSettled: true,
					category: null,
				},
			],
			totalItems: 1,
		});
		const out = await call(
			tools,
			"account_statement",
			{ accountId: UUID, startDate: "2026-02-01" },
			readCtx,
		);
		const call0 = mocks.fetchTransactionsPageWithRelations.mock.calls[0]?.[0];
		expect(call0.filters).toHaveLength(3);
		expect(call0.pageSize).toBe(30);
		expect(out.transactions[0]).toMatchObject({
			amount: -20.5,
			purchaseDate: "2026-02-01",
			category: null,
		});
	});

	it("list_inbox serializa itens e respeita status", async () => {
		mocks.fetchInboxItemsPage.mockResolvedValue({
			items: [
				{
					id: "i1",
					itemType: "notification",
					sourceApp: "com.nu",
					sourceAppName: "Nubank",
					originalTitle: "Compra",
					originalText: "Compra aprovada R$ 10,00",
					notificationTimestamp: new Date("2026-02-01T10:00:00Z"),
					parsedName: "Loja",
					parsedAmount: "10.00",
					parsedDate: null,
					transactionId: null,
				},
			],
			pagination: { totalItems: 7 },
		});
		const out = await call(tools, "list_inbox", {}, readCtx);
		expect(mocks.fetchInboxItemsPage).toHaveBeenCalledWith(
			"user-1",
			"pending",
			{ page: 1, pageSize: 20 },
		);
		expect(out).toMatchObject({ totalMatching: 7, returned: 1 });
		expect(out.items[0].sourceApp).toBe("Nubank");
	});

	it("list_savings_goals expõe só os campos esperados", async () => {
		mocks.fetchSavingsGoalsForUser.mockResolvedValue({
			goals: [
				{
					id: "g1",
					description: "Viagem",
					targetAmount: 1000,
					currentBalance: 400,
					progress: 100,
					percent: 10,
					isReached: false,
					startDate: "2026-01-01",
					targetDate: "2026-12-01",
					suggestedMonthlyContribution: 60,
					destinationAccount: { id: "a1", name: "Poupança", logo: "x.png" },
				},
			],
		});
		const out = await call(tools, "list_savings_goals", {}, readCtx);
		expect(out[0].destinationAccount).toEqual({ id: "a1", name: "Poupança" });
	});
});

describe("MCP tools — escrita", () => {
	let tools: Map<string, Registered>;
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.inserted.length = 0;
		mocks.updated.length = 0;
		mocks.dbSelectResult = [];
		mocks.insertReturning = [];
		tools = buildServer();
	});

	it("create_category insere com o userId do token e revalida", async () => {
		mocks.insertReturning = [{ id: UUID }];
		const out = await call(
			tools,
			"create_category",
			{ name: "Pets", type: "despesa", icon: "  " },
			writeCtx,
		);
		expect(mocks.inserted[0]).toMatchObject({
			name: "Pets",
			type: "despesa",
			icon: null,
			userId: "user-1",
		});
		expect(mocks.revalidateForEntity).toHaveBeenCalledWith(
			"categories",
			"user-1",
		);
		expect(out.category.id).toBe(UUID);
	});

	it("create_category valida o tipo", () => {
		expect(() =>
			tools.get("create_category")?.schema.parse({ name: "X", type: "outro" }),
		).toThrow();
	});

	it("create_budget recusa categoria de receita ou inexistente", async () => {
		const args = { categoryId: UUID, period: "2026-02", amount: 100 };
		mocks.categoryFindFirst.mockResolvedValueOnce(undefined);
		await expect(call(tools, "create_budget", args, writeCtx)).rejects.toThrow(
			"Categoria não encontrada.",
		);
		mocks.categoryFindFirst.mockResolvedValueOnce({
			id: UUID,
			name: "Salário",
			type: "receita",
		});
		await expect(call(tools, "create_budget", args, writeCtx)).rejects.toThrow(
			"categoria de despesa",
		);
		expect(mocks.inserted).toHaveLength(0);
	});

	it("create_budget detecta duplicidade e cria quando livre", async () => {
		const args = { categoryId: UUID, period: "2026-02", amount: 100 };
		mocks.categoryFindFirst.mockResolvedValue({
			id: UUID,
			name: "Mercado",
			type: "despesa",
		});
		mocks.insertReturning = [];
		await expect(call(tools, "create_budget", args, writeCtx)).rejects.toThrow(
			"Já existe um orçamento",
		);

		mocks.insertReturning = [{ id: UUID2 }];
		const out = await call(tools, "create_budget", args, writeCtx);
		expect(out.budget).toMatchObject({ id: UUID2, category: "Mercado" });
		expect(mocks.revalidateForEntity).toHaveBeenCalledWith("budgets", "user-1");
	});

	it("create_savings_goal valida ordem das datas e conta de destino", async () => {
		const base = {
			description: "Viagem",
			targetAmount: 1000,
			startDate: "2026-06-01",
			targetDate: "2026-12-01",
			destinationAccountId: UUID,
		};
		await expect(
			call(
				tools,
				"create_savings_goal",
				{ ...base, targetDate: "2026-01-01" },
				writeCtx,
			),
		).rejects.toThrow("posterior");

		mocks.fetchAccountCurrentBalance.mockResolvedValueOnce(null);
		await expect(
			call(tools, "create_savings_goal", base, writeCtx),
		).rejects.toThrow("Conta de destino inválida.");

		mocks.fetchAccountCurrentBalance.mockResolvedValueOnce(250);
		mocks.insertReturning = [{ id: UUID2 }];
		const out = await call(tools, "create_savings_goal", base, writeCtx);
		expect(mocks.fetchAccountCurrentBalance).toHaveBeenLastCalledWith(
			"user-1",
			UUID,
		);
		expect(mocks.inserted[0]).toMatchObject({
			userId: "user-1",
			startingBalance: "250.00",
			targetAmount: "1000.00",
		});
		expect(out.goal.id).toBe(UUID2);
	});

	it("process_inbox_item exige item pendente e lançamento do usuário", async () => {
		const args = { inboxItemId: UUID, transactionId: UUID2 };
		mocks.dbSelectResult = [];
		await expect(
			call(tools, "process_inbox_item", args, writeCtx),
		).rejects.toThrow("Item não encontrado");

		mocks.dbSelectResult = [{ id: UUID, attachmentId: null }];
		mocks.transactionFindFirst.mockResolvedValueOnce(undefined);
		await expect(
			call(tools, "process_inbox_item", args, writeCtx),
		).rejects.toThrow("Lançamento não encontrado.");
		expect(mocks.updated).toHaveLength(0);
	});

	it("process_inbox_item marca processado e anexa comprovante", async () => {
		mocks.dbSelectResult = [{ id: UUID, attachmentId: "att-1" }];
		mocks.transactionFindFirst.mockResolvedValueOnce({ id: UUID2 });
		await call(
			tools,
			"process_inbox_item",
			{ inboxItemId: UUID, transactionId: UUID2 },
			writeCtx,
		);
		expect(mocks.updated[0]).toMatchObject({
			status: "processed",
			transactionId: UUID2,
		});
		expect(mocks.inserted[0]).toEqual({
			transactionId: UUID2,
			attachmentId: "att-1",
		});
		expect(mocks.revalidateForEntity).toHaveBeenCalledWith("inbox", "user-1");
	});

	it("discard_inbox_item descarta apenas item pendente", async () => {
		mocks.dbSelectResult = [];
		await expect(
			call(tools, "discard_inbox_item", { inboxItemId: UUID }, writeCtx),
		).rejects.toThrow("Item não encontrado");

		mocks.dbSelectResult = [{ id: UUID }];
		await call(tools, "discard_inbox_item", { inboxItemId: UUID }, writeCtx);
		expect(mocks.updated[0]).toMatchObject({ status: "discarded" });
	});
});
