import { randomUUID } from "node:crypto";

import { transactions } from "@/db/schema";
import { handleActionError } from "@/shared/lib/actions/helpers";
import { db } from "@/shared/lib/db";
import {
	buildEntriesByPayer,
	sendPayerAutoEmails,
} from "@/shared/lib/payers/notifications";
import type { ActionResult } from "@/shared/lib/types/actions";
import { parseLocalDateString } from "@/shared/utils/date";
import {
	buildShares,
	buildTransactionRecords,
	type CreateInput,
	createSchema,
	formatPaidInvoicePeriods,
	getPaidInvoicePeriods,
	resolvePeriod,
	revalidate,
	validateAllOwnership,
	validateCardLimit,
} from "../actions/core";
import { copyAttachmentsForImport } from "./attachment-copy";

/**
 * Cria lançamentos (à vista, parcelados ou recorrentes, em conta ou cartão)
 * para um usuário já autenticado. Usado pela Server Action
 * `createTransactionAction` e pela tool MCP `create_transaction`, para as duas
 * entradas terem exatamente as mesmas validações (posse dos IDs, fatura paga,
 * limite do cartão) e o mesmo cálculo de parcelas/recorrência.
 */
export async function createTransactionsForUser({
	userId,
	userLabel,
	input,
}: {
	userId: string;
	userLabel: string;
	input: CreateInput;
}): Promise<ActionResult<{ ids: string[] }>> {
	try {
		const data = createSchema.parse(input);

		const ownershipError = await validateAllOwnership(userId, {
			payerId: data.payerId,
			secondaryPayerId: data.secondaryPayerId,
			splitPayerIds: data.splitShares?.map((share) => share.payerId),
			categoryId: data.categoryId,
			costCenterId: data.costCenterId,
			accountId: data.accountId,
			cardId: data.cardId,
		});
		if (ownershipError) {
			return { success: false, error: ownershipError };
		}

		const period = resolvePeriod(data.purchaseDate, data.period);
		const purchaseDate = parseLocalDateString(data.purchaseDate);
		const dueDate = data.dueDate ? parseLocalDateString(data.dueDate) : null;
		// Campo manual e independente de forma de pagamento/status — sem
		// preenchimento automático, só o que o usuário digitou.
		const paymentDate = data.paymentDate
			? parseLocalDateString(data.paymentDate)
			: null;

		const amountSign: 1 | -1 = data.transactionType === "Despesa" ? -1 : 1;
		const totalCents = Math.round(Math.abs(data.amount) * 100);
		const shouldNullifySettled = data.paymentMethod === "Cartão de crédito";

		const shares = buildShares({
			totalCents,
			payerId: data.payerId ?? null,
			isSplit: data.isSplit ?? false,
			secondaryPayerId: data.secondaryPayerId,
			splitShares: data.splitShares,
			primarySplitAmountCents: data.primarySplitAmount
				? Math.round(data.primarySplitAmount * 100)
				: undefined,
			secondarySplitAmountCents: data.secondarySplitAmount
				? Math.round(data.secondarySplitAmount * 100)
				: undefined,
		});

		const isSeriesLancamento =
			data.condition === "Parcelado" || data.condition === "Fixa";
		const seriesId = isSeriesLancamento ? randomUUID() : null;

		const records = buildTransactionRecords({
			data,
			userId: userId,
			period,
			purchaseDate,
			dueDate,
			shares,
			amountSign,
			shouldNullifySettled,
			paymentDate,
			seriesId,
		});

		if (!records.length) {
			throw new Error("Não foi possível criar os lançamentos solicitados.");
		}

		if (data.cardId) {
			const uniquePeriods = [
				...new Set(
					records.map((r) => r.period).filter((p): p is string => Boolean(p)),
				),
			];

			const paidPeriods = await getPaidInvoicePeriods(
				userId,
				data.cardId,
				uniquePeriods,
			);

			if (paidPeriods.length > 0) {
				return {
					success: false,
					error: `As faturas dos meses ${formatPaidInvoicePeriods(
						paidPeriods,
					)} já estão pagas. Desfaça o pagamento antes de adicionar este lançamento.`,
				} as ActionResult<{ ids: string[] }>;
			}

			if (data.transactionType === "Despesa") {
				const limitCheck = await validateCardLimit({
					userId: userId,
					cardId: data.cardId,
					// Parcelado: só conta as parcelas que serão criadas (a partir da
					// parcela inicial); as anteriores já passaram e não ocupam o limite
					// novo. Demais condições mantêm o valor informado.
					addAmount:
						data.condition === "Parcelado"
							? records.reduce(
									(acc, record) => acc + Math.abs(Number(record.amount)),
									0,
								)
							: Math.abs(data.amount),
				});
				if (!limitCheck.ok) {
					return {
						success: false,
						error: limitCheck.error,
					} as ActionResult<{ ids: string[] }>;
				}
			}
		}

		const inserted = await db
			.insert(transactions)
			.values(records)
			.returning({ id: transactions.id });

		if (data.importFromTransactionId && inserted.length > 0) {
			await copyAttachmentsForImport({
				sourceTransactionId: data.importFromTransactionId,
				targetTransactionIds: inserted.map((r) => r.id),
				targetUserId: userId,
			});
		}

		const notificationEntries = buildEntriesByPayer(
			records.map((record) => ({
				payerId: record.payerId ?? null,
				name: record.name ?? null,
				amount: record.amount ?? null,
				transactionType: record.transactionType ?? null,
				paymentMethod: record.paymentMethod ?? null,
				condition: record.condition ?? null,
				purchaseDate: record.purchaseDate ?? null,
				period: record.period ?? null,
				note: record.note ?? null,
			})),
		);

		if (notificationEntries.size > 0) {
			await sendPayerAutoEmails({
				userLabel: userLabel,
				action: "created",
				entriesByPayer: notificationEntries,
			});
		}

		revalidate(userId);

		return {
			success: true,
			message: "Lançamento criado com sucesso.",
			data: { ids: inserted.map((r) => r.id) },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{ ids: string[] }>;
	}
}
