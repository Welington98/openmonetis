"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
	bankConnections,
	financialAccounts,
	statementLines,
} from "@/db/schema";
import { fetchCategoryMappings } from "@/features/transactions/actions/category-memory-action";
import { createTransactionAction } from "@/features/transactions/actions/single-actions";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import { toDateOnlyString } from "@/shared/utils/date";
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

export async function triggerManualSyncAction(
	input: z.infer<typeof connectionIdSchema>,
): Promise<ActionResult<{ statementLinesCreated: number }>> {
	try {
		const userId = await getUserId();
		const data = connectionIdSchema.parse(input);

		const result = await syncBankConnection(data.connectionId, userId);
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

		const [lines, { defaultPayerId }] = await Promise.all([
			fetchStatementLines(userId, "unmatched"),
			fetchBankSyncDialogData(userId),
		]);

		if (lines.length === 0) {
			return {
				success: true,
				message: "Nenhuma transação pendente.",
				data: { imported: 0, skippedNoAccount: 0, skippedNoCategory: 0 },
			};
		}

		const categoryMappings = await fetchCategoryMappings(
			lines.map((line) => line.description),
		);

		let imported = 0;
		let skippedNoAccount = 0;
		let skippedNoCategory = 0;

		for (const line of lines) {
			if (!line.linkedFinancialAccountId) {
				skippedNoAccount++;
				continue;
			}

			const fallbackForType =
				line.type === "receita"
					? fallbackIncomeCategoryId
					: fallbackExpenseCategoryId;
			const categoryId =
				categoryMappings[normalizeDescriptionKey(line.description)] ??
				fallbackForType ??
				null;
			if (!categoryId) {
				skippedNoCategory++;
				continue;
			}

			const purchaseDate = toDateOnlyString(line.date);
			if (!purchaseDate) {
				skippedNoCategory++;
				continue;
			}

			const result = await createTransactionAction({
				name: line.description,
				transactionType: line.type === "receita" ? "Receita" : "Despesa",
				amount: Number(line.amount),
				paymentMethod: "Pix",
				condition: "À vista",
				purchaseDate,
				accountId: line.linkedFinancialAccountId,
				categoryId,
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
			parts.push(`${skippedNoAccount} sem conta vinculada`);
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

/**
 * Preenche `pluggy_conta_id` em linhas de extrato antigas, sincronizadas
 * antes desse campo existir (por isso vieram nulas e nunca casam com o
 * vínculo de conta feito em `linkPluggyAccountAction`). Rebusca o histórico
 * de transações de cada conta do Pluggy (mesmo endpoint do sync normal, sem
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
			const bankAccounts = accounts.filter((a) => a.type === "BANK");

			for (const account of bankAccounts) {
				const transactions = await fetchPluggyTransactions(account.id);
				const externalIds = transactions.map((t) => t.id);
				if (externalIds.length === 0) continue;

				const result = await db
					.update(statementLines)
					.set({ pluggyAccountId: account.id })
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
