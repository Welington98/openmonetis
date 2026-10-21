import type { McpServer } from "@modelcontextprotocol/server";
import { and, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import {
	attachments,
	cards,
	categories,
	costCenters,
	financialAccounts,
	payers,
	transactionAttachments,
	transactions,
	user,
} from "@/db/schema";
import { fetchDashboardAccounts } from "@/features/dashboard/lib/accounts-queries";
import {
	dateSchema,
	jsonResult,
	periodSchema,
	requireUserId,
	requireWriteScope,
} from "@/features/mcp/lib/helpers";
import { registerBankSyncTools } from "@/features/mcp/tools/bank-sync-tools";
import { registerReadTools } from "@/features/mcp/tools/read-tools";
import { registerWriteTools } from "@/features/mcp/tools/write-tools";
import { fetchCategoryReport } from "@/features/reports/lib/category-report-queries";
import { validateDateRange } from "@/features/reports/lib/utils";
import { cleanupAttachmentsAfterTransactionDelete } from "@/features/transactions/actions/attachments";
import {
	isInitialBalanceTransaction,
	resolvePeriod,
	resolveUserLabel,
	revalidate,
} from "@/features/transactions/actions/core";
import {
	CREDIT_CARD_PAYMENT_METHOD,
	MAX_TRANSACTION_INSTALLMENTS,
	PAYMENT_METHODS,
} from "@/features/transactions/lib/constants";
import { createTransactionsForUser } from "@/features/transactions/lib/create-transactions";
import { deriveCreditCardPeriod } from "@/features/transactions/lib/form-helpers";
import {
	fetchTransactionsPageWithRelations,
	fetchTransactionsWithRelations,
} from "@/features/transactions/queries";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { fetchOrSeedCostCentersForUser } from "@/shared/lib/cost-centers/queries";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import {
	getBusinessDateString,
	parseLocalDateString,
} from "@/shared/utils/date";

type TransactionRow = Awaited<
	ReturnType<typeof fetchTransactionsWithRelations>
>[number];

const TRANSACTION_TYPE_LABEL = {
	despesa: "Despesa",
	receita: "Receita",
} as const;

const WRITABLE_PAYMENT_METHODS = PAYMENT_METHODS.filter(
	(method) => method !== "Cartão de crédito",
) as [(typeof PAYMENT_METHODS)[number], ...(typeof PAYMENT_METHODS)[number][]];

function serializeTransaction(row: TransactionRow) {
	return {
		id: row.id,
		name: row.name,
		note: row.note,
		amount: Number(row.amount),
		type: row.transactionType,
		condition: row.condition,
		isSettled: row.isSettled,
		purchaseDate: row.purchaseDate.toISOString().slice(0, 10),
		dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
		installment:
			row.installmentCount && row.currentInstallment
				? `${row.currentInstallment}/${row.installmentCount}`
				: null,
		category: row.category
			? {
					id: row.category.id,
					name: row.category.name,
					type: row.category.type,
				}
			: null,
		account: row.financialAccount
			? { id: row.financialAccount.id, name: row.financialAccount.name }
			: null,
		card: row.card ? { id: row.card.id, name: row.card.name } : null,
		payer: row.payer ? { id: row.payer.id, name: row.payer.name } : null,
	};
}

/**
 * Registra as tools MCP de consulta e escrita financeira. userId nunca vem
 * dos argumentos da tool — só do token Bearer verificado (ctx.http.authInfo),
 * então uma tool jamais pode ler ou escrever dados de outro usuário. Tools de
 * escrita (`create_transaction`, `update_transaction`, `delete_transaction`)
 * também exigem o escopo `finance:write` do token, verificado em
 * `requireWriteScope`.
 *
 * `update_transaction`/`delete_transaction` reaproveitam as mesmas guardas de
 * proteção das Server Actions equivalentes (`updateTransactionAction`/
 * `deleteTransactionAction` em `features/transactions/actions/single-actions.ts`)
 * mas com escopo deliberadamente mais restrito: recusam lançamento de saldo
 * inicial, pagamento automático de fatura, cartão de crédito, transferência,
 * parcela de empréstimo, lançamento dividido ou detalhado — esses fluxos têm
 * efeitos colaterais (outra perna ligada, geração de fatura, etc.) que não
 * cabem numa tool MCP de escopo simples. Para esses casos a tool lança erro
 * orientando o usuário a usar o app.
 */
export function registerFinanceTools(server: McpServer) {
	server.registerTool(
		"list_transactions",
		{
			title: "Listar lançamentos financeiros",
			description:
				"Lista lançamentos (transações) financeiros do usuário autenticado, com filtros de data, tipo, categoria e busca por nome. Use para responder perguntas sobre gastos, receitas e histórico financeiro.",
			inputSchema: z.object({
				startDate: dateSchema
					.optional()
					.describe("Data de compra inicial (inclusive), formato YYYY-MM-DD"),
				endDate: dateSchema
					.optional()
					.describe("Data de compra final (inclusive), formato YYYY-MM-DD"),
				type: z
					.enum(["receita", "despesa"])
					.optional()
					.describe("Filtra por tipo de lançamento"),
				categoryId: z
					.string()
					.uuid()
					.optional()
					.describe("Filtra por ID de categoria"),
				search: z
					.string()
					.min(1)
					.optional()
					.describe("Busca por texto no nome do lançamento"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(100)
					.default(20)
					.describe("Máximo de lançamentos a retornar (padrão 20, máximo 100)"),
			}),
		},
		async ({ startDate, endDate, type, categoryId, search, limit }, ctx) => {
			const userId = requireUserId(ctx);

			const filters = [eq(transactions.userId, userId)];
			if (startDate) {
				filters.push(gte(transactions.purchaseDate, new Date(startDate)));
			}
			if (endDate) {
				filters.push(lte(transactions.purchaseDate, new Date(endDate)));
			}
			if (type) {
				filters.push(
					eq(transactions.transactionType, TRANSACTION_TYPE_LABEL[type]),
				);
			}
			if (categoryId) filters.push(eq(transactions.categoryId, categoryId));
			if (search) filters.push(ilike(transactions.name, `%${search}%`));

			const { rows, totalItems } = await fetchTransactionsPageWithRelations({
				filters,
				page: 1,
				pageSize: limit,
			});

			return jsonResult({
				totalMatching: totalItems,
				returned: rows.length,
				transactions: rows.map(serializeTransaction),
			});
		},
	);

	server.registerTool(
		"get_transaction",
		{
			title: "Detalhar um lançamento",
			description:
				"Busca um lançamento financeiro específico do usuário pelo ID retornado por list_transactions.",
			inputSchema: z.object({ id: z.string().uuid() }),
		},
		async ({ id }, ctx) => {
			const userId = requireUserId(ctx);
			const [row] = await fetchTransactionsWithRelations({
				filters: [eq(transactions.userId, userId), eq(transactions.id, id)],
			});
			if (!row) throw new Error("Lançamento não encontrado.");
			return jsonResult(serializeTransaction(row));
		},
	);

	server.registerTool(
		"list_categories",
		{
			title: "Listar categorias",
			description:
				"Lista as categorias de receita/despesa cadastradas pelo usuário.",
			inputSchema: z.object({
				type: z.enum(["receita", "despesa"]).optional(),
			}),
		},
		async ({ type }, ctx) => {
			const userId = requireUserId(ctx);
			const rows = await db.query.categories.findMany({
				where: type
					? and(eq(categories.userId, userId), eq(categories.type, type))
					: eq(categories.userId, userId),
			});
			return jsonResult(
				rows.map((c) => ({
					id: c.id,
					name: c.name,
					type: c.type,
					icon: c.icon,
				})),
			);
		},
	);

	server.registerTool(
		"list_accounts",
		{
			title: "Listar contas e saldos",
			description:
				"Lista as contas financeiras do usuário (contas correntes, carteiras, investimentos etc.) com o saldo atual calculado de cada uma e o saldo total consolidado.",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const { totalBalance, accounts } = await fetchDashboardAccounts(userId);
			return jsonResult({
				totalBalance,
				accounts: accounts.map((a) => ({
					id: a.id,
					name: a.name,
					accountType: a.accountType,
					status: a.status,
					balance: a.balance,
				})),
			});
		},
	);

	server.registerTool(
		"list_cost_centers",
		{
			title: "Listar centros de custo",
			description:
				"Lista os centros de custo do usuário (Fixa, Variável e Economia). O tipo decide como o lançamento entra no orçamento diário: fixa é pré-alocada do mês, variável consome a cota do dia, economia só rotula. Use o id em create_transaction/update_transaction (costCenterId).",
			inputSchema: z.object({}),
		},
		async (_args, ctx) => {
			const userId = requireUserId(ctx);
			const rows = await fetchOrSeedCostCentersForUser(userId);
			return jsonResult(
				rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
			);
		},
	);

	server.registerTool(
		"category_summary",
		{
			title: "Resumo de gastos por categoria",
			description:
				"Soma receitas/despesas por categoria em um intervalo de períodos mensais (formato YYYY-MM, máximo 24 meses), com comparação mês a mês. Use para perguntas como 'quanto gastei com mercado entre janeiro e março'.",
			inputSchema: z.object({
				startPeriod: periodSchema.describe("Período inicial, formato YYYY-MM"),
				endPeriod: periodSchema.describe("Período final, formato YYYY-MM"),
				categoryIds: z
					.array(z.string().uuid())
					.optional()
					.describe("Filtra por categorias específicas (opcional)"),
			}),
		},
		async ({ startPeriod, endPeriod, categoryIds }, ctx) => {
			const userId = requireUserId(ctx);

			const validation = validateDateRange(startPeriod, endPeriod);
			if (!validation.isValid) {
				throw new Error(validation.error ?? "Intervalo de período inválido.");
			}

			const report = await fetchCategoryReport(userId, {
				startPeriod,
				endPeriod,
				categoryIds,
			});

			return jsonResult({
				periods: report.periods,
				grandTotal: report.grandTotal,
				totalsByPeriod: Object.fromEntries(report.totals),
				categories: report.categories
					.map((c) => ({
						categoryId: c.categoryId,
						name: c.name,
						type: c.type,
						total: c.total,
						monthlyData: Object.fromEntries(c.monthlyData),
					}))
					.sort((a, b) => b.total - a.total),
			});
		},
	);

	server.registerTool(
		"create_transaction",
		{
			title: "Adicionar lançamento",
			description:
				"Cria lançamentos (despesa ou receita) para o usuário autenticado: à vista em conta, compra no cartão de crédito (cardId), parcelada (condition=Parcelado + installmentCount) ou recorrente mensal (condition=Fixa + recurrenceCount). Descubra os IDs com list_categories, list_accounts, list_cards, list_cost_centers e list_payers — a categoria precisa ser do mesmo tipo (despesa/receita) do lançamento. Compra no cartão não usa accountId: a fatura é escolhida pelo dia de fechamento do cartão. Em parcelado o valor informado é o TOTAL, dividido nas parcelas; em recorrente é o valor de CADA mês. Não cobre divisão entre pessoas — para esse caso, oriente o usuário a usar o app.",
			inputSchema: z.object({
				name: z
					.string()
					.trim()
					.min(1)
					.describe("Descrição/estabelecimento do lançamento"),
				amount: z
					.number()
					.positive()
					.describe(
						"Valor do lançamento, sempre positivo — o campo type define o sinal. Parcelado: valor total. Fixa: valor de cada mês.",
					),
				type: z.enum(["despesa", "receita"]).describe("Tipo do lançamento"),
				categoryId: z
					.string()
					.uuid()
					.describe(
						"ID da categoria (ver list_categories) — precisa ser do mesmo tipo informado em type",
					),
				accountId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"ID da conta financeira que paga/recebe (ver list_accounts). Obrigatório, exceto em compra no cartão (cardId).",
					),
				cardId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"ID do cartão de crédito (ver list_cards) para registrar uma compra no cartão. Só vale para despesa.",
					),
				date: dateSchema
					.optional()
					.describe("Data de compra, formato YYYY-MM-DD (padrão: hoje)"),
				paymentMethod: z
					.enum(WRITABLE_PAYMENT_METHODS)
					.optional()
					.describe(
						"Forma de pagamento (padrão: Pix). Em compra no cartão é sempre Cartão de crédito.",
					),
				condition: z
					.enum(["À vista", "Parcelado", "Fixa"])
					.optional()
					.describe(
						"Condição: À vista (padrão), Parcelado (exige installmentCount) ou Fixa, recorrência mensal (exige recurrenceCount)",
					),
				installmentCount: z
					.number()
					.int()
					.min(2)
					.max(MAX_TRANSACTION_INSTALLMENTS)
					.optional()
					.describe("Total de parcelas (condition=Parcelado)"),
				startInstallment: z
					.number()
					.int()
					.min(1)
					.optional()
					.describe(
						"Parcela em que começa o lançamento (padrão 1). Use para registrar só as parcelas restantes de uma compra antiga.",
					),
				recurrenceCount: z
					.number()
					.int()
					.min(2)
					.max(60)
					.optional()
					.describe("Por quantos meses repete (condition=Fixa), de 2 a 60"),
				dueDate: dateSchema
					.optional()
					.describe("Data de vencimento YYYY-MM-DD (opcional)"),
				costCenterId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"ID do centro de custo (ver list_cost_centers) — só relevante para despesa; se omitido, usa o padrão 'Variável' do usuário",
					),
				payerId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"ID da pessoa (ver list_payers). Padrão: a pessoa administradora. Despesas de outras pessoas ficam fora do orçamento diário.",
					),
				note: z
					.string()
					.trim()
					.max(500)
					.optional()
					.describe("Anotação opcional"),
				isSettled: z
					.boolean()
					.optional()
					.describe(
						"Já foi pago/recebido? Padrão: true para à vista em conta; false em parcelado/recorrente (vale para a primeira ocorrência). Ignorado em compra no cartão.",
					),
			}),
		},
		async (
			{
				name,
				amount,
				type,
				categoryId,
				accountId,
				cardId,
				date,
				paymentMethod,
				condition,
				installmentCount,
				startInstallment,
				recurrenceCount,
				dueDate,
				costCenterId,
				payerId,
				note,
				isSettled,
			},
			ctx,
		) => {
			const userId = requireWriteScope(ctx);

			const category = await db.query.categories.findFirst({
				where: and(
					eq(categories.id, categoryId),
					eq(categories.userId, userId),
				),
			});
			if (!category) throw new Error("Categoria não encontrada.");
			if (category.type !== type) {
				throw new Error(
					`A categoria "${category.name}" é do tipo "${category.type}", mas o lançamento é "${type}".`,
				);
			}

			const resolvedCondition = condition ?? "À vista";
			if (resolvedCondition === "Parcelado" && !installmentCount) {
				throw new Error("Informe installmentCount para lançamento parcelado.");
			}
			if (resolvedCondition === "Fixa" && !recurrenceCount) {
				throw new Error("Informe recurrenceCount para lançamento recorrente.");
			}

			const purchaseDateString = date ?? getBusinessDateString();
			let resolvedPeriod: string | undefined;
			let resolvedPaymentMethod: (typeof PAYMENT_METHODS)[number] =
				paymentMethod ?? "Pix";

			if (cardId) {
				if (type !== "despesa") {
					throw new Error("Compra no cartão só pode ser uma despesa.");
				}
				const card = await db.query.cards.findFirst({
					where: and(eq(cards.id, cardId), eq(cards.userId, userId)),
				});
				if (!card) throw new Error("Cartão não encontrado.");
				resolvedPaymentMethod = CREDIT_CARD_PAYMENT_METHOD;
				resolvedPeriod = deriveCreditCardPeriod(
					purchaseDateString,
					card.closingDay,
					card.dueDay,
				);
			} else if (!accountId) {
				throw new Error("Informe accountId (ou cardId para compra no cartão).");
			}

			let resolvedCostCenterId: string | undefined;
			if (costCenterId) {
				const costCenter = await db.query.costCenters.findFirst({
					where: and(
						eq(costCenters.id, costCenterId),
						eq(costCenters.userId, userId),
					),
				});
				if (!costCenter) throw new Error("Centro de custo não encontrado.");
				resolvedCostCenterId = costCenter.id;
			} else if (type === "despesa") {
				const userCostCenters = await fetchOrSeedCostCentersForUser(userId);
				const defaultCostCenter =
					userCostCenters.find((c) => c.kind === "variavel") ??
					userCostCenters[0];
				resolvedCostCenterId = defaultCostCenter?.id;
			}

			const resolvedPayerId = payerId ?? (await getAdminPayerId(userId));
			if (!resolvedPayerId) {
				throw new Error(
					"Pessoa com papel administrador não encontrada para este usuário.",
				);
			}

			const [authUser] = await db
				.select({ name: user.name, email: user.email })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1);

			const result = await createTransactionsForUser({
				userId,
				userLabel: resolveUserLabel(authUser ?? {}),
				input: {
					purchaseDate: purchaseDateString,
					period: resolvedPeriod,
					name: name.trim(),
					transactionType: TRANSACTION_TYPE_LABEL[type],
					amount,
					condition: resolvedCondition,
					paymentMethod: resolvedPaymentMethod,
					payerId: resolvedPayerId,
					isSplit: false,
					accountId: cardId ? null : (accountId ?? null),
					cardId: cardId ?? null,
					categoryId,
					costCenterId: resolvedCostCenterId ?? null,
					note: note && note.length > 0 ? note : null,
					installmentCount:
						resolvedCondition === "Parcelado" ? installmentCount : undefined,
					startInstallment:
						resolvedCondition === "Parcelado" ? startInstallment : undefined,
					recurrenceCount:
						resolvedCondition === "Fixa" ? recurrenceCount : undefined,
					dueDate,
					isSettled: cardId
						? null
						: (isSettled ?? resolvedCondition === "À vista"),
				},
			});

			if (!result.success) {
				throw new Error(result.error);
			}
			const createdIds = result.data?.ids ?? [];
			if (createdIds.length === 0) {
				throw new Error("Não foi possível criar o lançamento.");
			}

			const rows = await fetchTransactionsWithRelations({
				filters: [
					eq(transactions.userId, userId),
					inArray(transactions.id, createdIds),
				],
			});

			return jsonResult({
				message:
					createdIds.length > 1
						? `${createdIds.length} lançamentos criados com sucesso.`
						: "Lançamento criado com sucesso.",
				transactions: rows
					.map(serializeTransaction)
					.sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate)),
			});
		},
	);

	server.registerTool(
		"update_transaction",
		{
			title: "Editar lançamento",
			description:
				"Edita um lançamento existente (à vista ou ocorrência de série) do usuário autenticado. Todos os campos além de `id` são opcionais — só os informados são alterados, o resto mantém o valor atual. Edita só aquele lançamento, nunca a série inteira. Permite trocar centro de custo (costCenterId) e pessoa (payerId). Não cobre lançamentos de cartão de crédito, transferências, parcelas de empréstimo, lançamentos divididos ou detalhados, pagamentos automáticos de fatura nem saldo inicial — para esses casos, oriente o usuário a usar o app.",
			inputSchema: z.object({
				id: z
					.string()
					.uuid()
					.describe("ID do lançamento (ver list_transactions)"),
				name: z
					.string()
					.trim()
					.min(1)
					.optional()
					.describe("Nova descrição/estabelecimento"),
				amount: z
					.number()
					.positive()
					.optional()
					.describe(
						"Novo valor, sempre positivo — o campo type (novo ou atual) define o sinal",
					),
				type: z
					.enum(["despesa", "receita"])
					.optional()
					.describe(
						"Novo tipo do lançamento — se alterado e a categoria atual não for compatível, informe também categoryId",
					),
				categoryId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"Nova categoria (ver list_categories) — precisa ser do mesmo tipo resultante (despesa/receita)",
					),
				accountId: z
					.string()
					.uuid()
					.optional()
					.describe("Nova conta financeira (ver list_accounts)"),
				date: dateSchema
					.optional()
					.describe("Nova data de compra, formato YYYY-MM-DD"),
				paymentMethod: z
					.enum(WRITABLE_PAYMENT_METHODS)
					.optional()
					.describe(
						"Nova forma de pagamento. Pagamento no cartão de crédito não é suportado aqui.",
					),
				costCenterId: z
					.string()
					.uuid()
					.optional()
					.describe(
						"Novo centro de custo (ver list_cost_centers) — só para despesa",
					),
				payerId: z
					.string()
					.uuid()
					.optional()
					.describe("Nova pessoa responsável (ver list_payers)"),
				note: z.string().trim().max(500).optional().describe("Nova anotação"),
				isSettled: z
					.boolean()
					.optional()
					.describe("Novo status: já foi pago/recebido?"),
			}),
		},
		async (
			{
				id,
				name,
				amount,
				type,
				categoryId,
				accountId,
				date,
				paymentMethod,
				costCenterId,
				payerId,
				note,
				isSettled,
			},
			ctx,
		) => {
			const userId = requireWriteScope(ctx);

			const existing = await db.query.transactions.findFirst({
				where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
			});
			if (!existing) throw new Error("Lançamento não encontrado.");

			if (existing.note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX)) {
				throw new Error(
					"Pagamentos automáticos de fatura não podem ser editados por aqui.",
				);
			}
			if (isInitialBalanceTransaction(existing)) {
				throw new Error("Lançamentos de saldo inicial não podem ser editados.");
			}
			if (existing.transactionType === "Transferência") {
				throw new Error(
					"Transferências não podem ser editadas por aqui — use o app.",
				);
			}
			if (existing.paymentMethod === "Cartão de crédito") {
				throw new Error(
					"Lançamentos de cartão de crédito não podem ser editados por aqui — use o app.",
				);
			}
			if (existing.splitGroupId || existing.isDivided) {
				throw new Error(
					"Lançamentos divididos não podem ser editados por aqui — use o app.",
				);
			}
			if (existing.isItemized) {
				throw new Error(
					"Lançamentos detalhados não podem ser editados por aqui — use o app.",
				);
			}

			const resolvedTypeLabel = type
				? TRANSACTION_TYPE_LABEL[type]
				: existing.transactionType;

			let resolvedCategoryId = existing.categoryId;
			if (categoryId) {
				const category = await db.query.categories.findFirst({
					where: and(
						eq(categories.id, categoryId),
						eq(categories.userId, userId),
					),
				});
				if (!category) throw new Error("Categoria não encontrada.");
				const categoryTypeLabel =
					category.type === "despesa" ? "Despesa" : "Receita";
				if (categoryTypeLabel !== resolvedTypeLabel) {
					throw new Error(
						`A categoria "${category.name}" é do tipo "${category.type}", mas o lançamento seria "${resolvedTypeLabel === "Despesa" ? "despesa" : "receita"}".`,
					);
				}
				resolvedCategoryId = category.id;
			} else if (type && existing.categoryId) {
				const currentCategory = await db.query.categories.findFirst({
					where: eq(categories.id, existing.categoryId),
				});
				const currentCategoryTypeLabel = currentCategory
					? currentCategory.type === "despesa"
						? "Despesa"
						: "Receita"
					: null;
				if (currentCategory && currentCategoryTypeLabel !== resolvedTypeLabel) {
					throw new Error(
						`Alterar o tipo para "${type}" exige informar uma nova categoria (a atual, "${currentCategory.name}", é do tipo "${currentCategory.type}").`,
					);
				}
			}

			let resolvedAccountId = existing.accountId;
			if (accountId) {
				const account = await db.query.financialAccounts.findFirst({
					where: and(
						eq(financialAccounts.id, accountId),
						eq(financialAccounts.userId, userId),
					),
				});
				if (!account) throw new Error("Conta não encontrada.");
				resolvedAccountId = account.id;
			}

			let resolvedCostCenterId = existing.costCenterId;
			if (costCenterId) {
				if (resolvedTypeLabel !== "Despesa") {
					throw new Error("Centro de custo só vale para despesas.");
				}
				const costCenter = await db.query.costCenters.findFirst({
					where: and(
						eq(costCenters.id, costCenterId),
						eq(costCenters.userId, userId),
					),
				});
				if (!costCenter) throw new Error("Centro de custo não encontrado.");
				resolvedCostCenterId = costCenter.id;
			}

			let resolvedPayerId = existing.payerId;
			if (payerId) {
				const payer = await db.query.payers.findFirst({
					where: and(eq(payers.id, payerId), eq(payers.userId, userId)),
				});
				if (!payer) throw new Error("Pessoa não encontrada.");
				resolvedPayerId = payer.id;
			}

			const amountMagnitude =
				amount !== undefined ? amount : Math.abs(Number(existing.amount));
			const amountSign = resolvedTypeLabel === "Despesa" ? -1 : 1;
			const normalizedAmount = formatDecimalForDbRequired(
				amountMagnitude * amountSign,
			);

			const purchaseDateString =
				date ?? existing.purchaseDate.toISOString().slice(0, 10);
			const resolvedPurchaseDate = date
				? parseLocalDateString(date)
				: existing.purchaseDate;
			const resolvedPeriod = date
				? resolvePeriod(purchaseDateString)
				: existing.period;

			await db
				.update(transactions)
				.set({
					name: name?.trim() ?? existing.name,
					purchaseDate: resolvedPurchaseDate,
					transactionType: resolvedTypeLabel,
					amount: normalizedAmount,
					paymentMethod: paymentMethod ?? existing.paymentMethod,
					accountId: resolvedAccountId,
					categoryId: resolvedCategoryId,
					costCenterId: resolvedCostCenterId,
					payerId: resolvedPayerId,
					note:
						note !== undefined
							? note.length > 0
								? note
								: null
							: existing.note,
					isSettled: isSettled ?? existing.isSettled,
					period: resolvedPeriod,
				})
				.where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

			const [row] = await fetchTransactionsWithRelations({
				filters: [eq(transactions.userId, userId), eq(transactions.id, id)],
			});

			revalidate(userId);

			return jsonResult({
				message: "Lançamento atualizado com sucesso.",
				transaction: row ? serializeTransaction(row) : { id },
			});
		},
	);

	server.registerTool(
		"delete_transaction",
		{
			title: "Excluir lançamento",
			description:
				'Exclui definitivamente um lançamento do usuário autenticado. Exige confirm=true. Com scope="series", exclui também as demais ocorrências ainda não pagas da mesma série (parcelas ou recorrência), mantendo as já pagas — útil para remover uma série duplicada. Não cobre lançamentos de cartão de crédito, transferências, parcelas de empréstimo, lançamentos divididos ou detalhados, pagamentos automáticos de fatura nem saldo inicial — para esses casos, oriente o usuário a usar o app.',
			inputSchema: z.object({
				id: z
					.string()
					.uuid()
					.describe("ID do lançamento (ver list_transactions)"),
				scope: z
					.enum(["single", "series"])
					.optional()
					.describe(
						"single (padrão): só este lançamento. series: este e as demais ocorrências não pagas da mesma série.",
					),
				confirm: z
					.literal(true)
					.describe("Confirmação explícita e obrigatória da exclusão"),
			}),
		},
		async ({ id, scope }, ctx) => {
			const userId = requireWriteScope(ctx);

			const existing = await db.query.transactions.findFirst({
				where: and(eq(transactions.id, id), eq(transactions.userId, userId)),
			});
			if (!existing) throw new Error("Lançamento não encontrado.");

			const [rowBeforeDelete] = await fetchTransactionsWithRelations({
				filters: [eq(transactions.userId, userId), eq(transactions.id, id)],
			});

			if (existing.note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX)) {
				throw new Error(
					"Pagamentos automáticos de fatura não podem ser removidos por aqui.",
				);
			}
			if (isInitialBalanceTransaction(existing)) {
				throw new Error(
					"Lançamentos de saldo inicial não podem ser removidos.",
				);
			}
			if (existing.paymentMethod === "Cartão de crédito") {
				throw new Error(
					"Lançamentos de cartão de crédito não podem ser removidos por aqui — use o app.",
				);
			}
			if (existing.transactionType === "Transferência" || existing.transferId) {
				throw new Error(
					"Transferências não podem ser removidas por aqui — use o app.",
				);
			}
			if (existing.splitGroupId || existing.isDivided) {
				throw new Error(
					"Lançamentos divididos não podem ser removidos por aqui — use o app.",
				);
			}
			if (existing.isItemized) {
				throw new Error(
					"Lançamentos detalhados não podem ser removidos por aqui — use o app.",
				);
			}

			// scope=series: além deste lançamento, remove as demais ocorrências NÃO
			// pagas da mesma série; as já pagas ficam (são histórico real).
			let idsToDelete = [id];
			let keptSettled = 0;
			if (scope === "series") {
				if (!existing.seriesId) {
					throw new Error("Este lançamento não faz parte de uma série.");
				}
				const siblings = await db
					.select({ id: transactions.id, isSettled: transactions.isSettled })
					.from(transactions)
					.where(
						and(
							eq(transactions.userId, userId),
							eq(transactions.seriesId, existing.seriesId),
						),
					);
				const deletable = siblings.filter(
					(row) => row.id === id || !row.isSettled,
				);
				keptSettled = siblings.length - deletable.length;
				idsToDelete = deletable.map((row) => row.id);
			}

			const linkedAttachments = await db
				.select({ id: attachments.id, fileKey: attachments.fileKey })
				.from(transactionAttachments)
				.innerJoin(
					attachments,
					eq(transactionAttachments.attachmentId, attachments.id),
				)
				.where(inArray(transactionAttachments.transactionId, idsToDelete));

			await db
				.delete(transactions)
				.where(
					and(
						eq(transactions.userId, userId),
						inArray(transactions.id, idsToDelete),
					),
				);

			await cleanupAttachmentsAfterTransactionDelete(linkedAttachments);

			revalidate(userId);

			return jsonResult({
				message:
					idsToDelete.length > 1
						? `${idsToDelete.length} lançamentos da série removidos com sucesso.`
						: "Lançamento removido com sucesso.",
				removedCount: idsToDelete.length,
				keptSettledCount: keptSettled,
				transaction: rowBeforeDelete
					? serializeTransaction(rowBeforeDelete)
					: { id },
			});
		},
	);

	registerReadTools(server);
	registerWriteTools(server);
	registerBankSyncTools(server);
}
