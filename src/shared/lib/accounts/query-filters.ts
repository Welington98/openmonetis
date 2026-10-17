import { eq, ilike, isNull, not, or, sql } from "drizzle-orm";
import { financialAccounts, transactions } from "@/db/schema";
import {
	ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
	CARRY_OVER_NOTE_PREFIX,
	INSTALLMENT_INVOICE_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";

export const excludeTransactionsFromExcludedAccounts = () =>
	or(
		isNull(transactions.accountId),
		isNull(financialAccounts.excludeFromBalance),
		eq(financialAccounts.excludeFromBalance, false),
	) ?? sql`true`;

/**
 * Exclui lançamentos que apenas movem uma dívida de cartão já contada como
 * despesa: o pagamento da fatura (`AUTO_FATURA:`), o saldo financiado de um
 * pagamento parcial (`AUTO_SALDO_FINANCIADO:`) e as parcelas de uma fatura
 * parcelada (`AUTO_PARCELAMENTO_FATURA:`). As compras originais já estão na
 * fatura de origem — contar estes de novo duplicaria a despesa.
 *
 * Não usar para calcular dívida de cartão ainda a pagar: lá o saldo
 * financiado e as parcelas são dívida real da fatura seguinte.
 */
export const excludeInvoiceSettlementEntries = () =>
	or(
		isNull(transactions.note),
		not(
			or(
				ilike(transactions.note, `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`),
				ilike(transactions.note, `${CARRY_OVER_NOTE_PREFIX}%`),
				ilike(transactions.note, `${INSTALLMENT_INVOICE_NOTE_PREFIX}%`),
			) ?? sql`false`,
		),
	) ?? sql`true`;
