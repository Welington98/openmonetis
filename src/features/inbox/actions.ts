"use server";

import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { attachments, inboxItems, transactionAttachments } from "@/db/schema";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { MAX_FILE_SIZE } from "@/shared/lib/attachments/config";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	createPresignedPutUrl,
	headS3Object,
} from "@/shared/lib/storage/presign";
import type { ActionResult } from "@/shared/lib/types/actions";

const markProcessedSchema = z.object({
	inboxItemId: z.string().uuid("ID do item inválido"),
	transactionId: z.string().uuid("ID do lançamento inválido").optional(),
});

const discardInboxSchema = z.object({
	inboxItemId: z.string().uuid("ID do item inválido"),
});

const restoreDiscardedInboxSchema = z.object({
	inboxItemId: z.string().uuid("ID do item inválido"),
});

const bulkDiscardSchema = z.object({
	inboxItemIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um item"),
});

const deleteInboxSchema = z.object({
	inboxItemId: z.string().uuid("ID do item inválido"),
});

const bulkDeleteInboxSchema = z.object({
	status: z.enum(["processed", "discarded"]),
});

const bulkDeleteSelectedInboxSchema = z.object({
	inboxItemIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um item"),
});

function revalidateInbox(userId: string) {
	revalidateForEntity("inbox", userId);
}

/**
 * Mark an inbox item as processed after a lancamento was created
 */
export async function markInboxAsProcessedAction(
	input: z.infer<typeof markProcessedSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = markProcessedSchema.parse(input);

		// Verificar se item existe e pertence ao usuário
		const [item] = await db
			.select()
			.from(inboxItems)
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
					eq(inboxItems.status, "pending"),
				),
			)
			.limit(1);

		if (!item) {
			return { success: false, error: "Item não encontrado ou já processado." };
		}

		// Marcar item como processado
		await db
			.update(inboxItems)
			.set({
				status: "processed",
				processedAt: new Date(),
				transactionId: data.transactionId ?? null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
				),
			);

		// Se o item veio de um comprovante em PDF, anexa o mesmo arquivo ao
		// lançamento recém-criado
		if (item.attachmentId && data.transactionId) {
			await db
				.insert(transactionAttachments)
				.values({
					transactionId: data.transactionId,
					attachmentId: item.attachmentId,
				})
				.onConflictDoNothing();
		}

		revalidateInbox(user.id);

		return { success: true, message: "Item processado com sucesso!" };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function discardInboxItemAction(
	input: z.infer<typeof discardInboxSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = discardInboxSchema.parse(input);

		// Verificar se item existe e pertence ao usuário
		const [item] = await db
			.select()
			.from(inboxItems)
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
					eq(inboxItems.status, "pending"),
				),
			)
			.limit(1);

		if (!item) {
			return { success: false, error: "Item não encontrado ou já processado." };
		}

		// Marcar item como descartado
		await db
			.update(inboxItems)
			.set({
				status: "discarded",
				discardedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
				),
			);

		revalidateInbox(user.id);

		return { success: true, message: "Item descartado." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function bulkDiscardInboxItemsAction(
	input: z.infer<typeof bulkDiscardSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = bulkDiscardSchema.parse(input);

		// Marcar todos os itens como descartados
		await db
			.update(inboxItems)
			.set({
				status: "discarded",
				discardedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					inArray(inboxItems.id, data.inboxItemIds),
					eq(inboxItems.userId, user.id),
					eq(inboxItems.status, "pending"),
				),
			);

		revalidateInbox(user.id);

		return {
			success: true,
			message: `${data.inboxItemIds.length} item(s) descartado(s).`,
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function restoreDiscardedInboxItemAction(
	input: z.infer<typeof restoreDiscardedInboxSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = restoreDiscardedInboxSchema.parse(input);

		const [item] = await db
			.select({ id: inboxItems.id })
			.from(inboxItems)
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
					eq(inboxItems.status, "discarded"),
				),
			)
			.limit(1);

		if (!item) {
			return {
				success: false,
				error: "Item não encontrado ou não está descartado.",
			};
		}

		await db
			.update(inboxItems)
			.set({
				status: "pending",
				discardedAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
				),
			);

		revalidateInbox(user.id);

		return { success: true, message: "Item voltou para pendentes." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteInboxItemAction(
	input: z.infer<typeof deleteInboxSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteInboxSchema.parse(input);

		const [item] = await db
			.select({ status: inboxItems.status })
			.from(inboxItems)
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
				),
			)
			.limit(1);

		if (!item) {
			return { success: false, error: "Item não encontrado." };
		}

		if (item.status === "pending") {
			return {
				success: false,
				error: "Não é possível excluir itens pendentes.",
			};
		}

		await db
			.delete(inboxItems)
			.where(
				and(
					eq(inboxItems.id, data.inboxItemId),
					eq(inboxItems.userId, user.id),
				),
			);

		revalidateInbox(user.id);

		return { success: true, message: "Item excluído." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function bulkDeleteSelectedInboxItemsAction(
	input: z.infer<typeof bulkDeleteSelectedInboxSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = bulkDeleteSelectedInboxSchema.parse(input);

		const result = await db
			.delete(inboxItems)
			.where(
				and(
					inArray(inboxItems.id, data.inboxItemIds),
					eq(inboxItems.userId, user.id),
					ne(inboxItems.status, "pending"),
				),
			)
			.returning({ id: inboxItems.id });

		revalidateInbox(user.id);

		const count = result.length;
		return {
			success: true,
			message: `${count} item(s) excluído(s).`,
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function bulkDeleteInboxItemsAction(
	input: z.infer<typeof bulkDeleteInboxSchema>,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = bulkDeleteInboxSchema.parse(input);

		const result = await db
			.delete(inboxItems)
			.where(
				and(eq(inboxItems.userId, user.id), eq(inboxItems.status, data.status)),
			)
			.returning({ id: inboxItems.id });

		revalidateInbox(user.id);

		const count = result.length;
		return {
			success: true,
			message: `${count} item(s) excluído(s).`,
		};
	} catch (error) {
		return handleActionError(error);
	}
}

const receiptPresignSchema = z.object({
	fileName: z.string().min(1),
	fileSize: z.number().max(MAX_FILE_SIZE, "Arquivo deve ter no máximo 50MB."),
});

type ReceiptPresignResult =
	| { success: true; presignedUrl: string; fileKey: string }
	| { success: false; error: string };

/**
 * Gera uma URL pré-assinada para upload direto de um comprovante em PDF ao S3.
 * O item de inbox só é criado depois, em `createReceiptInboxItemAction`,
 * após o parse do texto acontecer no client.
 */
export async function getReceiptUploadUrlAction(
	input: z.infer<typeof receiptPresignSchema>,
): Promise<ReceiptPresignResult> {
	try {
		const user = await getUser();
		receiptPresignSchema.parse(input);

		const fileKey = `${user.id}/${randomUUID()}.pdf`;
		const presignedUrl = await createPresignedPutUrl(
			fileKey,
			"application/pdf",
		);

		return { success: true, presignedUrl, fileKey };
	} catch (error) {
		const result = handleActionError(error);
		if (!result.success) return { success: false, error: result.error };
		return { success: false, error: "Erro inesperado." };
	}
}

const createReceiptInboxItemSchema = z.object({
	fileKey: z.string().min(1),
	fileName: z.string().min(1),
	fileSize: z.number().positive(),
	originalText: z.string().min(1).max(5000),
	parsedName: z.string().trim().max(500).optional(),
	parsedAmount: z.number().optional(),
	parsedDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
});

/**
 * Confirma o upload do comprovante (já feito direto ao S3 via a URL
 * pré-assinada) e cria o pré-lançamento (`item_type = "receipt_pdf"`) para
 * revisão — mesmo fluxo de revisão já usado pelas notificações do Companion.
 */
export async function createReceiptInboxItemAction(
	input: z.infer<typeof createReceiptInboxItemSchema>,
): Promise<ActionResult<{ inboxItemId: string }>> {
	try {
		const user = await getUser();
		const data = createReceiptInboxItemSchema.parse(input);

		if (!data.fileKey.startsWith(`${user.id}/`)) {
			return { success: false, error: "Upload de comprovante inválido." };
		}

		const objectMetadata = await headS3Object(data.fileKey);

		if (!objectMetadata.contentLength || objectMetadata.contentLength <= 0) {
			return { success: false, error: "Arquivo enviado não encontrado." };
		}

		if (objectMetadata.contentLength > MAX_FILE_SIZE) {
			return {
				success: false,
				error: "O arquivo enviado excede o limite permitido de 50MB.",
			};
		}

		if (objectMetadata.contentType !== "application/pdf") {
			return { success: false, error: "O arquivo enviado não é um PDF." };
		}

		const [attachment] = await db
			.insert(attachments)
			.values({
				userId: user.id,
				fileKey: data.fileKey,
				fileName: data.fileName,
				fileSize: data.fileSize,
				mimeType: "application/pdf",
			})
			.returning({ id: attachments.id });

		if (!attachment) {
			return { success: false, error: "Erro ao salvar o comprovante." };
		}

		const [inserted] = await db
			.insert(inboxItems)
			.values({
				userId: user.id,
				itemType: "receipt_pdf",
				sourceApp: "receipt_pdf",
				sourceAppName: "Comprovante PDF",
				originalText: data.originalText,
				notificationTimestamp: new Date(),
				parsedName: data.parsedName ?? null,
				parsedAmount: data.parsedAmount?.toString(),
				parsedDate: data.parsedDate ? new Date(data.parsedDate) : null,
				attachmentId: attachment.id,
				status: "pending",
			})
			.returning({ id: inboxItems.id });

		if (!inserted) {
			return { success: false, error: "Erro ao criar item na inbox." };
		}

		revalidateInbox(user.id);

		return {
			success: true,
			message: "Comprovante enviado para revisão.",
			data: { inboxItemId: inserted.id },
		};
	} catch (error) {
		const result = handleActionError(error);
		return {
			success: false,
			error: result.success ? "Ocorreu um erro inesperado." : result.error,
		};
	}
}
