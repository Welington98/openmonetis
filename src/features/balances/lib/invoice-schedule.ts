import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import { buildDateOnlyStringFromPeriodDay } from "@/shared/utils/date";

/**
 * Uma linha por (cartão, período) dentro da janela — já com a cota do
 * pagador admin aplicada (não o valor bruto da fatura), espelhando o mesmo
 * cálculo de `updateInvoicePaymentStatusAction` (`adminPayableAmount`):
 * `Math.abs(Math.min(somaDosLançamentosDoAdminNesseCartão/período, 0))`.
 */
export type InvoiceDueAggregate = {
	cardId: string;
	/** Dia de vencimento do cartão ("dt_vencimento"), string — pode passar do fim do mês (clampado por `buildDateOnlyStringFromPeriodDay`). */
	dueDay: string;
	/** "YYYY-MM" — período/fatura em que o lançamento caiu (já desloca no fechamento, ver `deriveCreditCardPeriod`). */
	period: string;
	/** `null` = nunca teve `invoices` upsertada ainda ⇒ tratada como não paga. */
	paymentStatus: string | null;
	/** Magnitude positiva, já filtrada pra cota do pagador admin. */
	adminTotal: number;
};

/**
 * Mapeia faturas não pagas pra um Map<data de vencimento, soma>. Fatura paga
 * é descartada: o pagamento já virou um lançamento realizado real (nota
 * `AUTO_FATURA:`), que está dentro de `anchorBalance` — contar a fatura de
 * novo aqui dobraria a saída. O mesmo vale para fatura parcialmente paga
 * (o restante já virou um lançamento de "Saldo financiado" na fatura
 * seguinte) e para fatura parcelada (o restante já virou as transações de
 * parcelamento em faturas futuras) — em ambos os casos a dívida remanescente
 * já existe como transação real em outro período, que entra no cronograma
 * quando ESSE período for agregado. Duas faturas de cartões diferentes
 * vencendo no mesmo dia somam na mesma célula.
 */
export function buildCardDueSchedule(
	invoices: InvoiceDueAggregate[],
): Map<string, number> {
	const schedule = new Map<string, number>();

	for (const invoice of invoices) {
		if (
			invoice.paymentStatus === INVOICE_PAYMENT_STATUS.PAID ||
			invoice.paymentStatus === INVOICE_PAYMENT_STATUS.PARTIAL ||
			invoice.paymentStatus === INVOICE_PAYMENT_STATUS.INSTALLED
		) {
			continue;
		}
		if (invoice.adminTotal <= 0) {
			continue;
		}

		const dueDate = buildDateOnlyStringFromPeriodDay(
			invoice.period,
			invoice.dueDay,
		);
		if (!dueDate) {
			continue;
		}

		schedule.set(dueDate, (schedule.get(dueDate) ?? 0) + invoice.adminTotal);
	}

	return schedule;
}
