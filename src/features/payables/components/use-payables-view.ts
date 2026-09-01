"use client";

import { useMemo } from "react";
import { useBillWidgetController } from "@/features/dashboard/bills/use-bill-widget-controller";
import { useInvoicesWidgetController } from "@/features/dashboard/invoices/use-invoices-widget-controller";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import type { PayableBillDetails, PayableRow } from "../types";

/**
 * Faturas de cartão e lançamentos avulsos usam actions diferentes para
 * marcar como pago (`updateInvoicePaymentStatusAction` vs.
 * `toggleTransactionSettlementAction`), então reaproveitamos os dois
 * controllers/dialogs já existentes no widget do dashboard em vez de criar
 * um terceiro fluxo genérico.
 */
export function usePayablesView(
	payables: PayableRow[],
	receivables: PayableRow[],
) {
	const bills = useMemo(
		() =>
			[...payables, ...receivables]
				.filter((row) => row.kind === "transaction")
				.map((row) => row.bill),
		[payables, receivables],
	);

	const invoiceItems = useMemo(
		() =>
			payables
				.filter((row) => row.kind === "invoice")
				.map((row) => row.invoice),
		[payables],
	);

	const billController = useBillWidgetController(bills);
	const invoiceController = useInvoicesWidgetController(invoiceItems);

	const billsById = useMemo(
		() => new Map(billController.items.map((bill) => [bill.id, bill])),
		[billController.items],
	);
	const invoicesById = useMemo(
		() =>
			new Map(invoiceController.items.map((invoice) => [invoice.id, invoice])),
		[invoiceController.items],
	);

	const buildLiveRows = (rows: PayableRow[]): PayableRow[] =>
		rows
			.map(
				(row): PayableRow =>
					row.kind === "transaction"
						? {
								...row,
								// `billController.items` é tipado como DashboardBill[] (o
								// controller genérico do dashboard não conhece os campos
								// extras da payables), mas os objetos que ele guarda em
								// memória são os mesmos PayableBillDetails que entraram —
								// o controller só faz spread, nunca remove campo.
								bill:
									(billsById.get(row.id) as PayableBillDetails | undefined) ??
									row.bill,
							}
						: { ...row, invoice: invoicesById.get(row.id) ?? row.invoice },
			)
			.filter((row) =>
				row.kind === "transaction"
					? !row.bill.isSettled
					: row.invoice.paymentStatus !== INVOICE_PAYMENT_STATUS.PAID,
			);

	return {
		livePayables: buildLiveRows(payables),
		liveReceivables: buildLiveRows(receivables),
		billController,
		invoiceController,
	};
}
