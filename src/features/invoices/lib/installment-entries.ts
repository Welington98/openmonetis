import {
	buildInstallmentInterestName,
	buildInstallmentInterestNote,
	buildInstallmentInvoiceName,
	buildInstallmentInvoiceNote,
} from "@/shared/lib/accounts/constants";
import type { AmortizationInstallment } from "@/shared/lib/amortization";
import { addMonthsToPeriod } from "@/shared/utils/period";

export type InstallmentInvoiceEntry = {
	name: string;
	note: string;
	/** Valor em centavos, positivo (o chamador aplica o sinal de despesa). */
	amountCents: number;
	period: string;
	installmentNumber: number;
	kind: "principal" | "interest";
};

/**
 * Converte a tabela de amortização numa lista de lançamentos de cartão.
 *
 * Cada parcela vira um lançamento de principal (excluído dos totais de despesa,
 * porque as compras originais já foram contadas) e, quando há juros, um
 * lançamento separado de juros (contado como despesa). A soma dos dois é o
 * valor da parcela na fatura.
 */
export function buildInstallmentInvoiceEntries({
	cardId,
	period,
	installmentCount,
	schedule,
}: {
	cardId: string;
	period: string;
	installmentCount: number;
	schedule: AmortizationInstallment[];
}): InstallmentInvoiceEntry[] {
	const entries: InstallmentInvoiceEntry[] = [];

	for (const row of schedule) {
		const entryPeriod = addMonthsToPeriod(period, row.installmentNumber);

		entries.push({
			name: buildInstallmentInvoiceName(
				row.installmentNumber,
				installmentCount,
			),
			note: buildInstallmentInvoiceNote(cardId, period, row.installmentNumber),
			amountCents: row.principalAmountCents,
			period: entryPeriod,
			installmentNumber: row.installmentNumber,
			kind: "principal",
		});

		if (row.interestAmountCents > 0) {
			entries.push({
				name: buildInstallmentInterestName(
					row.installmentNumber,
					installmentCount,
				),
				note: buildInstallmentInterestNote(
					cardId,
					period,
					row.installmentNumber,
				),
				amountCents: row.interestAmountCents,
				period: entryPeriod,
				installmentNumber: row.installmentNumber,
				kind: "interest",
			});
		}
	}

	return entries;
}
