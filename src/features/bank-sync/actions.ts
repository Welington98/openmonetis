"use server";

import { and, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
	bankConnections,
	cards,
	categories,
	financialAccounts,
	statementLines,
	transactions,
} from "@/db/schema";
import { resolveDefaultAvailableModel } from "@/features/insights/lib/model-provider";
import { fetchStatementCategorizationMode } from "@/features/settings/queries";
import { fetchCategoryMappings } from "@/features/transactions/actions/category-memory-action";
import { createTransactionAction } from "@/features/transactions/actions/single-actions";
import type { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { fetchOrSeedCostCentersForUser } from "@/shared/lib/cost-centers/queries";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import { toDateOnlyString } from "@/shared/utils/date";
import { suggestCategoryForStatementLine } from "./lib/ai-categorize";
import {
	createPluggyConnectToken,
	fetchPluggyAccounts,
	fetchPluggyItem,
	fetchPluggyTransactions,
	isPluggyConfigured,
} from "./lib/pluggy-client";
import { syncBankConnection } from "./lib/sync";
import { fetchBankSyncDialogData, fetchStatementLines } from "./queries";

function revalidateBankSync(userId: string) {
	revalidateForEntity("bankSync", userId);
}

/**
 * Lançamentos importados automaticamente (sem revisão manual) sempre entram
 * como "variável" — mesmo fallback seguro usado pra lançamento sem centro de
 * custo em outros lugares do orçamento diário.
 */
async function resolveVariableCostCenterId(
	userId: string,
): Promise<string | null> {
	const costCenters = await fetchOrSeedCostCentersForUser(userId);
	return (
		costCenters.find((costCenter) => costCenter.kind === "variavel")?.id ?? null
	);
}

/**
 * Cria o token de curta duração usado pelo widget Pluggy Connect no client.
 * `itemId` é passado quando o usuário está atualizando uma conexão existente
 * (ex.: credenciais expiradas).
 */
export async function createConnectTokenAction(
	itemId?: string,
): Promise<ActionResult<{ accessToken: string; sandbox: boolean }>> {
	try {
		const userId = await getUserId();

		if (!isPluggyConfigured()) {
			return {
				success: false,
				error:
					"Sincronização bancária não configurada. Peça ao administrador para definir PLUGGY_CLIENT_ID/PLUGGY_CLIENT_SECRET.",
			};
		}

		const accessToken = await createPluggyConnectToken({
			itemId,
			clientUserId: userId,
		});
		const sandbox = process.env.PLUGGY_USE_SANDBOX !== "false";

		return {
			success: true,
			message: "Token criado.",
			data: { accessToken, sandbox },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			accessToken: string;
			sandbox: boolean;
		}>;
	}
}

const saveConnectionSchema = z.object({
	pluggyItemId: z.string().min(1, "Item inválido."),
});

/**
 * Chamado pelo client depois que o widget Pluggy Connect reporta sucesso
 * (evento `onSuccess`, que traz o `item.id`). Busca os detalhes do item na
 * API do Pluggy (nunca confia em dados vindos só do client) e persiste a
 * conexão. Dispara o primeiro sync imediatamente.
 */
export async function saveBankConnectionAction(
	input: z.infer<typeof saveConnectionSchema>,
): Promise<ActionResult<{ connectionId: string }>> {
	try {
		const userId = await getUserId();
		const data = saveConnectionSchema.parse(input);

		const item = await fetchPluggyItem(data.pluggyItemId);

		const [existing] = await db
			.select({ id: bankConnections.id })
			.from(bankConnections)
			.where(eq(bankConnections.pluggyItemId, item.id))
			.limit(1);

		let connectionId: string;

		if (existing) {
			await db
				.update(bankConnections)
				.set({ status: item.status, connectorName: item.connector.name })
				.where(eq(bankConnections.id, existing.id));
			connectionId = existing.id;
		} else {
			const [created] = await db
				.insert(bankConnections)
				.values({
					userId,
					pluggyItemId: item.id,
					connectorName: item.connector.name,
					status: item.status,
					isActive: true,
				})
				.returning({ id: bankConnections.id });

			if (!created) {
				return { success: false, error: "Não foi possível salvar a conexão." };
			}
			connectionId = created.id;
		}

		try {
			await syncBankConnection(connectionId, userId);
		} catch (syncError) {
			console.error("[bank-sync] Sync inicial falhou:", syncError);
			// Conexão fica salva mesmo se o primeiro sync falhar; o usuário pode
			// tentar sincronizar manualmente depois.
		}

		revalidateBankSync(userId);

		return {
			success: true,
			message: "Conta bancária conectada!",
			data: { connectionId },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{ connectionId: string }>;
	}
}

const connectionIdSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida."),
});

const dateOnlySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const triggerManualSyncSchema = connectionIdSchema.extend({
	dateFrom: dateOnlySchema.nullable().optional(),
	dateTo: dateOnlySchema.nullable().optional(),
});

/**
 * Sincronização manual, disparada pelo usuário. `dateFrom`/`dateTo` (opcionais)
 * permitem restringir a um período específico em vez de puxar tudo — útil
 * pra reimportar só um mês, por exemplo, sem reprocessar o histórico inteiro.
 */
export async function triggerManualSyncAction(
	input: z.infer<typeof triggerManualSyncSchema>,
): Promise<ActionResult<{ statementLinesCreated: number }>> {
	try {
		const userId = await getUserId();
		const data = triggerManualSyncSchema.parse(input);

		if (data.dateFrom && data.dateTo && data.dateFrom > data.dateTo) {
			return {
				success: false,
				error: "A data inicial não pode ser depois da data final.",
			};
		}

		const result = await syncBankConnection(data.connectionId, userId, {
			dateFrom: data.dateFrom ?? undefined,
			dateTo: data.dateTo ?? undefined,
		});
		revalidateBankSync(userId);

		return {
			success: true,
			message:
				result.statementLinesCreated > 0
					? `${result.statementLinesCreated} nova(s) transação(ões) importada(s).`
					: "Nenhuma transação nova encontrada.",
			data: { statementLinesCreated: result.statementLinesCreated },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			statementLinesCreated: number;
		}>;
	}
}

export async function deleteBankConnectionAction(
	input: z.infer<typeof connectionIdSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = connectionIdSchema.parse(input);

		await db
			.update(financialAccounts)
			.set({ bankConnectionId: null })
			.where(
				and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.bankConnectionId, data.connectionId),
				),
			);

		await db
			.update(cards)
			.set({ bankConnectionId: null })
			.where(
				and(
					eq(cards.userId, userId),
					eq(cards.bankConnectionId, data.connectionId),
				),
			);

		await db
			.delete(bankConnections)
			.where(
				and(
					eq(bankConnections.id, data.connectionId),
					eq(bankConnections.userId, userId),
				),
			);

		revalidateBankSync(userId);

		return { success: true, message: "Conexão removida." };
	} catch (error) {
		return handleActionError(error);
	}
}

const renameBankConnectionSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida."),
	nickname: z.string().trim().max(60, "Máximo de 60 caracteres.").nullable(),
});

/**
 * Define (ou limpa, se `nickname` vier vazio/null) um apelido pra conexão,
 * exibido no lugar do nome do conector. Nunca sobrescreve `connectorName` —
 * esse continua vindo puro do Pluggy a cada reconexão.
 */
export async function renameBankConnectionAction(
	input: z.infer<typeof renameBankConnectionSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = renameBankConnectionSchema.parse(input);
		const nickname =
			data.nickname && data.nickname.length > 0 ? data.nickname : null;

		await db
			.update(bankConnections)
			.set({ nickname })
			.where(
				and(
					eq(bankConnections.id, data.connectionId),
					eq(bankConnections.userId, userId),
				),
			);

		revalidateBankSync(userId);
		revalidateForEntity("accounts", userId);

		return {
			success: true,
			message: nickname ? "Apelido salvo." : "Apelido removido.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

const statementLineIdSchema = z.object({
	statementLineId: z.string().uuid("Linha inválida."),
});

export async function ignoreStatementLineAction(
	input: z.infer<typeof statementLineIdSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = statementLineIdSchema.parse(input);

		await db
			.update(statementLines)
			.set({ status: "ignored" })
			.where(
				and(
					eq(statementLines.id, data.statementLineId),
					eq(statementLines.userId, userId),
					eq(statementLines.status, "unmatched"),
				),
			);

		revalidateBankSync(userId);

		return { success: true, message: "Linha ignorada." };
	} catch (error) {
		return handleActionError(error);
	}
}

const matchStatementLineSchema = z.object({
	statementLineId: z.string().uuid("Linha inválida."),
	transactionId: z.string().uuid("Lançamento inválido."),
});

/** Casa manualmente uma linha de extrato com um lançamento já existente. */
export async function matchStatementLineAction(
	input: z.infer<typeof matchStatementLineSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = matchStatementLineSchema.parse(input);

		await db
			.update(statementLines)
			.set({ status: "matched", matchedTransactionId: data.transactionId })
			.where(
				and(
					eq(statementLines.id, data.statementLineId),
					eq(statementLines.userId, userId),
					eq(statementLines.status, "unmatched"),
				),
			);

		revalidateBankSync(userId);

		return { success: true, message: "Lançamento vinculado." };
	} catch (error) {
		return handleActionError(error);
	}
}

/**
 * Chamado depois que o TransactionDialog cria um lançamento a partir de uma
 * linha pendente. O TransactionDialog não expõe o id do lançamento criado no
 * callback `onSuccess` (mesma limitação já existente no fluxo de inbox), então
 * aqui só marcamos a linha como resolvida — sem popular `matchedTransactionId`.
 * Vincular ao lançamento exato exigiria alterar o `onSuccess` do
 * TransactionDialog, que é compartilhado por várias features; deixado de fora
 * deste primeiro corte por prudência.
 */
export type PluggyAccountLinkRow = {
	pluggyAccountId: string;
	name: string;
	balance: number;
	linkedFinancialAccountId: string | null;
};

/**
 * Lista as contas bancárias (tipo BANK) trazidas pelo Pluggy para uma conexão,
 * já indicando qual conta local (se alguma) está vinculada a cada uma — para
 * montar a tela de "vincular contas".
 */
export async function fetchPluggyAccountsForConnectionAction(
	input: z.infer<typeof connectionIdSchema>,
): Promise<ActionResult<{ accounts: PluggyAccountLinkRow[] }>> {
	try {
		const userId = await getUserId();
		const data = connectionIdSchema.parse(input);

		const [connection] = await db
			.select({ pluggyItemId: bankConnections.pluggyItemId })
			.from(bankConnections)
			.where(
				and(
					eq(bankConnections.id, data.connectionId),
					eq(bankConnections.userId, userId),
				),
			)
			.limit(1);

		if (!connection) {
			return { success: false, error: "Conexão não encontrada." };
		}

		const [pluggyAccounts, linkedAccounts] = await Promise.all([
			fetchPluggyAccounts(connection.pluggyItemId),
			db
				.select({
					id: financialAccounts.id,
					pluggyAccountId: financialAccounts.pluggyAccountId,
				})
				.from(financialAccounts)
				.where(
					and(
						eq(financialAccounts.userId, userId),
						eq(financialAccounts.bankConnectionId, data.connectionId),
					),
				),
		]);

		const linkedByPluggyId = new Map(
			linkedAccounts
				.filter((row) => row.pluggyAccountId)
				.map((row) => [row.pluggyAccountId as string, row.id]),
		);

		const accounts = pluggyAccounts
			.filter((account) => account.type === "BANK")
			.map((account) => ({
				pluggyAccountId: account.id,
				name: account.name,
				balance: account.balance,
				linkedFinancialAccountId: linkedByPluggyId.get(account.id) ?? null,
			}));

		return { success: true, message: "Contas carregadas.", data: { accounts } };
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			accounts: PluggyAccountLinkRow[];
		}>;
	}
}

const linkPluggyAccountSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida."),
	pluggyAccountId: z.string().min(1, "Conta do Pluggy inválida."),
	financialAccountId: z.string().uuid("Conta inválida.").nullable(),
});

/**
 * Vincula (ou desvincula, se `financialAccountId` for null) uma conta do
 * Pluggy a uma conta local — para que as transações sincronizadas dessa conta
 * caiam na conta certa ao criar o lançamento.
 */
export async function linkPluggyAccountAction(
	input: z.infer<typeof linkPluggyAccountSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = linkPluggyAccountSchema.parse(input);

		const [connection] = await db
			.select({ id: bankConnections.id })
			.from(bankConnections)
			.where(
				and(
					eq(bankConnections.id, data.connectionId),
					eq(bankConnections.userId, userId),
				),
			)
			.limit(1);

		if (!connection) {
			return { success: false, error: "Conexão não encontrada." };
		}

		// Libera essa conta do Pluggy de qualquer outra conta local que a
		// tivesse antes (o índice único não permite a mesma conta do Pluggy
		// vinculada a duas contas locais ao mesmo tempo).
		await db
			.update(financialAccounts)
			.set({ bankConnectionId: null, pluggyAccountId: null })
			.where(
				and(
					eq(financialAccounts.userId, userId),
					eq(financialAccounts.pluggyAccountId, data.pluggyAccountId),
				),
			);

		if (data.financialAccountId) {
			const [target] = await db
				.select({ id: financialAccounts.id })
				.from(financialAccounts)
				.where(
					and(
						eq(financialAccounts.id, data.financialAccountId),
						eq(financialAccounts.userId, userId),
					),
				)
				.limit(1);

			if (!target) {
				return { success: false, error: "Conta local não encontrada." };
			}

			await db
				.update(financialAccounts)
				.set({
					bankConnectionId: data.connectionId,
					pluggyAccountId: data.pluggyAccountId,
				})
				.where(eq(financialAccounts.id, data.financialAccountId));
		}

		revalidateBankSync(userId);

		return {
			success: true,
			message: data.financialAccountId
				? "Conta vinculada."
				: "Vínculo removido.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export type PluggyCardLinkRow = {
	pluggyAccountId: string;
	name: string;
	balance: number;
	linkedCardId: string | null;
};

/**
 * Lista as contas de cartão de crédito (tipo CREDIT) trazidas pelo Pluggy
 * para uma conexão, já indicando qual cartão local (se algum) está vinculado
 * a cada uma — para montar a tela de "vincular cartões".
 */
export async function fetchPluggyCardsForConnectionAction(
	input: z.infer<typeof connectionIdSchema>,
): Promise<ActionResult<{ cards: PluggyCardLinkRow[] }>> {
	try {
		const userId = await getUserId();
		const data = connectionIdSchema.parse(input);

		const [connection] = await db
			.select({ pluggyItemId: bankConnections.pluggyItemId })
			.from(bankConnections)
			.where(
				and(
					eq(bankConnections.id, data.connectionId),
					eq(bankConnections.userId, userId),
				),
			)
			.limit(1);

		if (!connection) {
			return { success: false, error: "Conexão não encontrada." };
		}

		const [pluggyAccounts, linkedCards] = await Promise.all([
			fetchPluggyAccounts(connection.pluggyItemId),
			db
				.select({
					id: cards.id,
					pluggyAccountId: cards.pluggyAccountId,
				})
				.from(cards)
				.where(
					and(
						eq(cards.userId, userId),
						eq(cards.bankConnectionId, data.connectionId),
					),
				),
		]);

		const linkedByPluggyId = new Map(
			linkedCards
				.filter((row) => row.pluggyAccountId)
				.map((row) => [row.pluggyAccountId as string, row.id]),
		);

		const cardResults = pluggyAccounts
			.filter((account) => account.type === "CREDIT")
			.map((account) => ({
				pluggyAccountId: account.id,
				name: account.name,
				balance: account.balance,
				linkedCardId: linkedByPluggyId.get(account.id) ?? null,
			}));

		return {
			success: true,
			message: "Cartões carregados.",
			data: { cards: cardResults },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			cards: PluggyCardLinkRow[];
		}>;
	}
}

const linkPluggyCardSchema = z.object({
	connectionId: z.string().uuid("Conexão inválida."),
	pluggyAccountId: z.string().min(1, "Cartão do Pluggy inválido."),
	cardId: z.string().uuid("Cartão inválido.").nullable(),
});

/**
 * Vincula (ou desvincula, se `cardId` for null) uma conta de cartão do
 * Pluggy a um cartão local — mesma lógica de `linkPluggyAccountAction`, pro
 * lado dos cartões de crédito.
 */
export async function linkPluggyCardAction(
	input: z.infer<typeof linkPluggyCardSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = linkPluggyCardSchema.parse(input);

		const [connection] = await db
			.select({ id: bankConnections.id })
			.from(bankConnections)
			.where(
				and(
					eq(bankConnections.id, data.connectionId),
					eq(bankConnections.userId, userId),
				),
			)
			.limit(1);

		if (!connection) {
			return { success: false, error: "Conexão não encontrada." };
		}

		// Libera esse cartão do Pluggy de qualquer outro cartão local que o
		// tivesse antes (o índice único não permite o mesmo cartão do Pluggy
		// vinculado a dois cartões locais ao mesmo tempo).
		await db
			.update(cards)
			.set({ bankConnectionId: null, pluggyAccountId: null })
			.where(
				and(
					eq(cards.userId, userId),
					eq(cards.pluggyAccountId, data.pluggyAccountId),
				),
			);

		if (data.cardId) {
			const [target] = await db
				.select({ id: cards.id })
				.from(cards)
				.where(and(eq(cards.id, data.cardId), eq(cards.userId, userId)))
				.limit(1);

			if (!target) {
				return { success: false, error: "Cartão local não encontrado." };
			}

			await db
				.update(cards)
				.set({
					bankConnectionId: data.connectionId,
					pluggyAccountId: data.pluggyAccountId,
				})
				.where(eq(cards.id, data.cardId));
		}

		revalidateBankSync(userId);
		revalidateForEntity("cards", userId);

		return {
			success: true,
			message: data.cardId ? "Cartão vinculado." : "Vínculo removido.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function markStatementLineMatchedAction(
	input: z.infer<typeof statementLineIdSchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = statementLineIdSchema.parse(input);

		await db
			.update(statementLines)
			.set({ status: "matched" })
			.where(
				and(
					eq(statementLines.id, data.statementLineId),
					eq(statementLines.userId, userId),
					eq(statementLines.status, "unmatched"),
				),
			);

		revalidateBankSync(userId);

		return { success: true, message: "Linha marcada como lançada." };
	} catch (error) {
		return handleActionError(error);
	}
}

export type BulkImportSummary = {
	imported: number;
	skippedNoAccount: number;
	skippedNoCategory: number;
};

/**
 * Cria lançamento em lote para todas as linhas de extrato pendentes que já
 * têm conta local vinculada (via `financialAccounts.pluggyAccountId`) e
 * categoria conhecida (mesmo mapeamento description → categoria que o import
 * de OFX/planilha usa). Linhas sem conta ou sem categoria conhecida ficam de
 * fora — nunca adivinha categoria, só reaproveita o que o usuário já
 * categorizou antes para uma descrição parecida.
 */
const bulkImportSchema = z.object({
	fallbackExpenseCategoryId: z.string().uuid().nullable().optional(),
	fallbackIncomeCategoryId: z.string().uuid().nullable().optional(),
});

export async function bulkImportStatementLinesAction(
	input: z.infer<typeof bulkImportSchema> = {},
): Promise<ActionResult<BulkImportSummary>> {
	try {
		const userId = await getUserId();
		const { fallbackExpenseCategoryId, fallbackIncomeCategoryId } =
			bulkImportSchema.parse(input);

		const [lines, { defaultPayerId }, variableCostCenterId] = await Promise.all(
			[
				fetchStatementLines(userId, "unmatched"),
				fetchBankSyncDialogData(userId),
				resolveVariableCostCenterId(userId),
			],
		);

		if (lines.length === 0) {
			return {
				success: true,
				message: "Nenhuma transação pendente.",
				data: { imported: 0, skippedNoAccount: 0, skippedNoCategory: 0 },
			};
		}

		let imported = 0;
		let skippedNoAccount = 0;
		let skippedNoCategory = 0;

		for (const line of lines) {
			const isCardLine = line.pluggyAccountType === "CREDIT";
			if (isCardLine ? !line.linkedCardId : !line.linkedFinancialAccountId) {
				skippedNoAccount++;
				continue;
			}

			const fallbackForType =
				line.type === "receita"
					? fallbackIncomeCategoryId
					: fallbackExpenseCategoryId;
			const categoryId = line.categoryId ?? fallbackForType ?? null;
			if (!categoryId) {
				skippedNoCategory++;
				continue;
			}

			const purchaseDate = toDateOnlyString(line.date);
			if (!purchaseDate) {
				skippedNoCategory++;
				continue;
			}

			const importTransactionType =
				line.type === "receita" ? "Receita" : "Despesa";
			const result = await createTransactionAction({
				name: line.description,
				transactionType: importTransactionType,
				amount: Number(line.amount),
				paymentMethod: isCardLine ? "Cartão de crédito" : "Pix",
				condition: "À vista",
				purchaseDate,
				accountId: isCardLine ? null : line.linkedFinancialAccountId,
				cardId: isCardLine ? line.linkedCardId : null,
				categoryId,
				costCenterId:
					importTransactionType === "Despesa" ? variableCostCenterId : null,
				payerId: defaultPayerId,
				isSettled: true,
				isSplit: false,
				note: null,
			});

			if (!result.success || !result.data) continue;

			await db
				.update(statementLines)
				.set({
					status: "matched",
					matchedTransactionId: result.data.ids[0],
				})
				.where(eq(statementLines.id, line.id));

			imported++;
		}

		revalidateBankSync(userId);
		revalidateForEntity("transactions", userId);

		const parts = [`${imported} lançamento(s) importado(s)`];
		if (skippedNoAccount > 0) {
			parts.push(`${skippedNoAccount} sem conta/cartão vinculado`);
		}
		if (skippedNoCategory > 0) {
			parts.push(`${skippedNoCategory} sem categoria conhecida`);
		}

		return {
			success: true,
			message: `${parts.join(", ")}.`,
			data: { imported, skippedNoAccount, skippedNoCategory },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<BulkImportSummary>;
	}
}

export type BulkClassifySummary = {
	classified: number;
	skippedNoAccount: number;
	skippedNoCategory: number;
	skippedNoCostCenter: number;
};

/**
 * Conciliação em massa: recebe um conjunto de linhas selecionadas pelo
 * usuário (checkboxes na lista) e cria um lançamento para cada uma. Campos
 * como categoria/conta/pessoa/forma de pagamento são opcionais — quando
 * informados, valem pra todas as linhas selecionadas de uma vez; quando
 * omitidos, cai no que a linha já tinha (categoria sugerida, conta vinculada
 * pelo Pluggy). Linhas que já foram conciliadas (fora do escopo "unmatched")
 * são ignoradas silenciosamente, mesma regra do restante da tela.
 */
const bulkClassifyStatementLinesSchema = z.object({
	statementLineIds: z.array(z.string().uuid()).min(1),
	categoryId: z.string().uuid().nullable().optional(),
	costCenterId: z.string().uuid().nullable().optional(),
	accountId: z.string().uuid().nullable().optional(),
	cardId: z.string().uuid().nullable().optional(),
	payerId: z.string().uuid().nullable().optional(),
	paymentMethod: z.string().min(1).optional(),
});

export async function bulkClassifyStatementLinesAction(
	input: z.infer<typeof bulkClassifyStatementLinesSchema>,
): Promise<ActionResult<BulkClassifySummary>> {
	try {
		const userId = await getUserId();
		const data = bulkClassifyStatementLinesSchema.parse(input);

		const [lines, { defaultPayerId }] = await Promise.all([
			fetchStatementLines(userId, "unmatched"),
			fetchBankSyncDialogData(userId),
		]);

		const selectedIds = new Set(data.statementLineIds);
		const targetLines = lines.filter((line) => selectedIds.has(line.id));

		let classified = 0;
		let skippedNoAccount = 0;
		let skippedNoCategory = 0;
		let skippedNoCostCenter = 0;

		for (const line of targetLines) {
			const isCardLine = line.pluggyAccountType === "CREDIT";
			const accountId = isCardLine
				? null
				: (data.accountId ?? line.linkedFinancialAccountId);
			const cardId = isCardLine ? (data.cardId ?? line.linkedCardId) : null;
			if (isCardLine ? !cardId : !accountId) {
				skippedNoAccount++;
				continue;
			}

			const categoryId = data.categoryId ?? line.categoryId;
			if (!categoryId) {
				skippedNoCategory++;
				continue;
			}

			const transactionType = line.type === "receita" ? "Receita" : "Despesa";
			if (transactionType === "Despesa" && !data.costCenterId) {
				skippedNoCostCenter++;
				continue;
			}

			const purchaseDate = toDateOnlyString(line.date);
			if (!purchaseDate) {
				skippedNoCategory++;
				continue;
			}

			const result = await createTransactionAction({
				name: line.description,
				transactionType,
				amount: Number(line.amount),
				paymentMethod: isCardLine
					? "Cartão de crédito"
					: ((data.paymentMethod ?? "Pix") as (typeof PAYMENT_METHODS)[number]),
				condition: "À vista",
				accountId,
				cardId,
				purchaseDate,
				categoryId,
				costCenterId: transactionType === "Despesa" ? data.costCenterId : null,
				payerId: data.payerId ?? defaultPayerId,
				isSettled: true,
				isSplit: false,
				note: null,
			});

			if (!result.success || !result.data) continue;

			await db
				.update(statementLines)
				.set({
					status: "matched",
					matchedTransactionId: result.data.ids[0],
				})
				.where(eq(statementLines.id, line.id));

			classified++;
		}

		revalidateBankSync(userId);
		revalidateForEntity("transactions", userId);

		const parts = [`${classified} lançamento(s) conciliado(s)`];
		if (skippedNoAccount > 0) {
			parts.push(`${skippedNoAccount} sem conta/cartão vinculado`);
		}
		if (skippedNoCategory > 0) {
			parts.push(`${skippedNoCategory} sem categoria`);
		}
		if (skippedNoCostCenter > 0) {
			parts.push(`${skippedNoCostCenter} sem centro de custo`);
		}

		return {
			success: true,
			message: `${parts.join(", ")}.`,
			data: {
				classified,
				skippedNoAccount,
				skippedNoCategory,
				skippedNoCostCenter,
			},
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<BulkClassifySummary>;
	}
}

/**
 * Preenche `pluggy_conta_id`/`pluggy_conta_tipo` em linhas de extrato antigas,
 * sincronizadas antes desses campos existirem (por isso vieram nulos e nunca
 * casam com o vínculo de conta/cartão feito em `linkPluggyAccountAction`/
 * `linkPluggyCardAction`). Rebusca o histórico de transações de cada conta
 * do Pluggy — banco ou cartão — (mesmo endpoint do sync normal, sem
 * `dateFrom` = histórico completo) e casa por `externalId` — não inventa
 * nada, só recupera um dado que já existia na API e não tinha sido salvo.
 */
export async function backfillStatementLineAccountsAction(): Promise<
	ActionResult<{ updated: number }>
> {
	try {
		const userId = await getUserId();

		const pendingConnections = await db
			.selectDistinct({
				connectionId: statementLines.bankConnectionId,
				pluggyItemId: bankConnections.pluggyItemId,
			})
			.from(statementLines)
			.innerJoin(
				bankConnections,
				eq(statementLines.bankConnectionId, bankConnections.id),
			)
			.where(
				and(
					eq(statementLines.userId, userId),
					isNull(statementLines.pluggyAccountId),
				),
			);

		let updated = 0;

		for (const { connectionId, pluggyItemId } of pendingConnections) {
			const accounts = await fetchPluggyAccounts(pluggyItemId);

			for (const account of accounts) {
				const transactions = await fetchPluggyTransactions(account.id);
				const externalIds = transactions.map((t) => t.id);
				if (externalIds.length === 0) continue;

				const result = await db
					.update(statementLines)
					.set({
						pluggyAccountId: account.id,
						pluggyAccountType: account.type,
					})
					.where(
						and(
							eq(statementLines.userId, userId),
							eq(statementLines.bankConnectionId, connectionId),
							isNull(statementLines.pluggyAccountId),
							inArray(statementLines.externalId, externalIds),
						),
					)
					.returning({ id: statementLines.id });

				updated += result.length;
			}
		}

		revalidateBankSync(userId);

		return {
			success: true,
			message:
				updated > 0
					? `${updated} transação(ões) antiga(s) recuperada(s).`
					: "Nenhuma transação antiga precisava de correção.",
			data: { updated },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{ updated: number }>;
	}
}

export type TransactionMatchCandidate = {
	id: string;
	name: string;
	amount: string;
	purchaseDate: Date;
	categoryName: string | null;
	isSettled: boolean | null;
};

const searchTransactionsSchema = z.object({
	query: z.string().trim().max(200),
	accountId: z.string().uuid().nullable().optional(),
});

/**
 * Busca lançamentos já existentes pra conciliar manualmente com uma linha de
 * extrato, em vez de criar um novo (aba "Escolher lançamento existente").
 */
export async function searchTransactionsToMatchAction(
	input: z.infer<typeof searchTransactionsSchema>,
): Promise<ActionResult<{ transactions: TransactionMatchCandidate[] }>> {
	try {
		const userId = await getUserId();
		const data = searchTransactionsSchema.parse(input);

		const conditions = [eq(transactions.userId, userId)];
		if (data.query.length > 0) {
			conditions.push(ilike(transactions.name, `%${data.query}%`));
		}
		if (data.accountId) {
			conditions.push(eq(transactions.accountId, data.accountId));
		}

		const rows = await db
			.select({
				id: transactions.id,
				name: transactions.name,
				amount: transactions.amount,
				purchaseDate: transactions.purchaseDate,
				categoryName: categories.name,
				isSettled: transactions.isSettled,
			})
			.from(transactions)
			.leftJoin(categories, eq(transactions.categoryId, categories.id))
			.where(and(...conditions))
			.orderBy(desc(transactions.purchaseDate))
			.limit(25);

		return {
			success: true,
			message: "Busca concluída.",
			data: { transactions: rows },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			transactions: TransactionMatchCandidate[];
		}>;
	}
}

export type StatementLineMatchCandidate = {
	id: string;
	description: string;
	amount: string;
	date: Date;
	type: string;
	categoryName: string | null;
};

const searchStatementLinesSchema = z.object({
	query: z.string().trim().max(200),
});

/**
 * Busca linhas de extrato ainda pendentes pra conciliar manualmente com um
 * lançamento já existente — direção inversa de `searchTransactionsToMatchAction`,
 * usada a partir da tela de Transações ("Conciliar com extrato").
 */
export async function searchUnmatchedStatementLinesAction(
	input: z.infer<typeof searchStatementLinesSchema>,
): Promise<ActionResult<{ lines: StatementLineMatchCandidate[] }>> {
	try {
		const userId = await getUserId();
		const data = searchStatementLinesSchema.parse(input);

		const conditions = [
			eq(statementLines.userId, userId),
			eq(statementLines.status, "unmatched"),
		];
		if (data.query.length > 0) {
			conditions.push(ilike(statementLines.description, `%${data.query}%`));
		}

		const rows = await db
			.select({
				id: statementLines.id,
				description: statementLines.description,
				amount: statementLines.amount,
				date: statementLines.date,
				type: statementLines.type,
				categoryName: categories.name,
			})
			.from(statementLines)
			.leftJoin(categories, eq(statementLines.categoryId, categories.id))
			.where(and(...conditions))
			.orderBy(desc(statementLines.date))
			.limit(25);

		return {
			success: true,
			message: "Busca concluída.",
			data: { lines: rows },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			lines: StatementLineMatchCandidate[];
		}>;
	}
}

export type SuggestCategoriesSummary = {
	byMapping: number;
	byAi: number;
	unresolved: number;
};

/**
 * Preenche `categoryId`/`categorySource` (sugestão, nunca aplicada sozinha)
 * em todas as linhas pendentes sem categoria ainda: primeiro tenta o
 * mapeamento por descrição (grátis); se ainda faltar e o usuário tiver
 * "Sugerir com IA" ativado nas configurações, chama a IA linha a linha.
 */
export async function suggestCategoriesForPendingLinesAction(): Promise<
	ActionResult<SuggestCategoriesSummary>
> {
	try {
		const userId = await getUserId();

		const [lines, mode] = await Promise.all([
			fetchStatementLines(userId, "unmatched"),
			fetchStatementCategorizationMode(userId),
		]);

		const uncategorized = lines.filter((line) => !line.categoryId);

		let byMapping = 0;
		let byAi = 0;
		let unresolved = 0;

		if (uncategorized.length === 0) {
			return {
				success: true,
				message: "Nenhuma linha pendente sem categoria.",
				data: { byMapping, byAi, unresolved },
			};
		}

		const categoryMappings = await fetchCategoryMappings(
			uncategorized.map((line) => line.description),
		);

		const aiConfigured =
			mode === "ai" ? resolveDefaultAvailableModel() !== null : false;

		const allCategories =
			mode === "ai" && aiConfigured
				? await db
						.select({
							id: categories.id,
							name: categories.name,
							type: categories.type,
						})
						.from(categories)
						.where(eq(categories.userId, userId))
				: [];

		for (const line of uncategorized) {
			const mappedCategoryId =
				categoryMappings[normalizeDescriptionKey(line.description)];

			if (mappedCategoryId) {
				await db
					.update(statementLines)
					.set({ categoryId: mappedCategoryId, categorySource: "mapping" })
					.where(eq(statementLines.id, line.id));
				byMapping++;
				continue;
			}

			if (mode !== "ai" || !aiConfigured) {
				unresolved++;
				continue;
			}

			const candidateCategories = allCategories.filter(
				(c) => c.type === line.type,
			);
			const suggested = await suggestCategoryForStatementLine({
				description: line.description,
				amount: Number(line.amount),
				type: line.type === "receita" ? "receita" : "despesa",
				categories: candidateCategories,
			});

			if (suggested) {
				await db
					.update(statementLines)
					.set({ categoryId: suggested, categorySource: "ai" })
					.where(eq(statementLines.id, line.id));
				byAi++;
			} else {
				unresolved++;
			}
		}

		revalidateBankSync(userId);

		const parts = [];
		if (byMapping > 0) parts.push(`${byMapping} pelo histórico`);
		if (byAi > 0) parts.push(`${byAi} pela IA`);
		if (unresolved > 0) parts.push(`${unresolved} sem sugestão`);

		let message =
			parts.length > 0
				? `Categorias sugeridas: ${parts.join(", ")}.`
				: "Nada pra sugerir.";

		if (mode === "ai" && !aiConfigured) {
			message +=
				" Categorização por IA não está configurada no servidor — defina uma chave de API (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, DEEPSEEK_API_KEY ou MINIMAX_API_KEY) para habilitá-la.";
		}

		return {
			success: true,
			message,
			data: { byMapping, byAi, unresolved },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<SuggestCategoriesSummary>;
	}
}

const setStatementLineCategorySchema = z.object({
	statementLineId: z.string().uuid("Linha inválida."),
	categoryId: z.string().uuid("Categoria inválida.").nullable(),
});

/** Usuário confirmando/trocando manualmente a categoria sugerida de uma linha. */
export async function setStatementLineCategoryAction(
	input: z.infer<typeof setStatementLineCategorySchema>,
): Promise<ActionResult> {
	try {
		const userId = await getUserId();
		const data = setStatementLineCategorySchema.parse(input);

		await db
			.update(statementLines)
			.set({
				categoryId: data.categoryId,
				categorySource: data.categoryId ? "manual" : null,
			})
			.where(
				and(
					eq(statementLines.id, data.statementLineId),
					eq(statementLines.userId, userId),
				),
			);

		revalidateBankSync(userId);

		return { success: true, message: "Categoria atualizada." };
	} catch (error) {
		return handleActionError(error);
	}
}
