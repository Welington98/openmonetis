import type { transactions } from "@/db/schema";
import {
	TRANSFER_CONDITION,
	TRANSFER_ESTABLISHMENT_ENTRADA,
	TRANSFER_ESTABLISHMENT_SAIDA,
	TRANSFER_PAYMENT_METHOD,
} from "@/shared/lib/transfers/constants";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { addMonthsToDate } from "@/shared/utils/date";
import { addMonthsToPeriod } from "@/shared/utils/period";

const TRANSFER_INSTALLMENT_INTERVAL_MONTHS = 1;

export type TransferInstallmentBatchParams = {
	fromAccountId: string;
	fromAccountName: string;
	toAccountId: string;
	toAccountName: string;
	amount: number;
	firstDate: Date;
	firstPeriod: string;
	installmentCount: number;
	userId: string;
	adminPayerId: string;
	transferCategoryId: string;
};

/**
 * Gera as linhas de uma transferência parcelada: um par saída/entrada por
 * parcela (cada par com seu próprio `transferId`), todos ligados pelo mesmo
 * `seriesId` — mesmo padrão de série usado em despesas/receitas parceladas
 * (`buildTransactionRecords`). Com `installmentCount === 1` gera o mesmo par
 * único que uma transferência à vista.
 */
export function buildTransferInstallmentBatches({
	fromAccountId,
	fromAccountName,
	toAccountId,
	toAccountName,
	amount,
	firstDate,
	firstPeriod,
	installmentCount,
	userId,
	adminPayerId,
	transferCategoryId,
}: TransferInstallmentBatchParams) {
	const seriesId = installmentCount > 1 ? crypto.randomUUID() : null;
	const amountValue = formatDecimalForDbRequired(Math.abs(amount));
	const negativeAmountValue = formatDecimalForDbRequired(-Math.abs(amount));

	const rows: (typeof transactions.$inferInsert)[] = [];

	for (let index = 0; index < installmentCount; index += 1) {
		const installmentDate = addMonthsToDate(
			firstDate,
			index * TRANSFER_INSTALLMENT_INTERVAL_MONTHS,
		);
		const installmentPeriod = addMonthsToPeriod(
			firstPeriod,
			index * TRANSFER_INSTALLMENT_INTERVAL_MONTHS,
		);
		const transferId = crypto.randomUUID();
		const currentInstallment = index + 1;

		const sharedFields = {
			condition:
				installmentCount > 1 ? ("Parcelado" as const) : TRANSFER_CONDITION,
			paymentMethod: TRANSFER_PAYMENT_METHOD,
			note: `de ${fromAccountName} -> ${toAccountName}`,
			purchaseDate: installmentDate,
			transactionType: "Transferência" as const,
			period: installmentPeriod,
			isSettled: true,
			userId,
			categoryId: transferCategoryId,
			payerId: adminPayerId,
			transferId,
			seriesId,
			installmentCount: installmentCount > 1 ? installmentCount : null,
			currentInstallment: installmentCount > 1 ? currentInstallment : null,
			installmentIntervalMonths: TRANSFER_INSTALLMENT_INTERVAL_MONTHS,
		};

		rows.push({
			...sharedFields,
			name: TRANSFER_ESTABLISHMENT_SAIDA,
			amount: negativeAmountValue,
			accountId: fromAccountId,
		});
		rows.push({
			...sharedFields,
			name: TRANSFER_ESTABLISHMENT_ENTRADA,
			amount: amountValue,
			accountId: toAccountId,
		});
	}

	return rows;
}
