"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	bankConnections,
	financialAccounts,
	statementLines,
} from "@/db/schema";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import type { ActionResult } from "@/shared/lib/types/actions";
import {
	createPluggyConnectToken,
	fetchPluggyItem,
	isPluggyConfigured,
} from "./lib/pluggy-client";
import { syncBankConnection } from "./lib/sync";

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
