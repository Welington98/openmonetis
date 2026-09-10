"use client";

import { useEffect, useRef, useState } from "react";
import {
	getCurrentDateString,
	type InvoiceDialogState,
	isInvoicePaid,
	markInvoiceAsPaid,
} from "@/features/dashboard/invoices/invoices-helpers";
import type { DashboardInvoice } from "@/features/dashboard/invoices/invoices-queries";
import {
	type PaymentDialogController,
	usePaymentDialogController,
} from "@/features/dashboard/payments/use-payment-dialog-controller";
import { updateInvoicePaymentStatusAction } from "@/features/invoices/actions";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";

type InvoicesWidgetController = Omit<
	PaymentDialogController<DashboardInvoice>,
	"selectedItem"
> & {
	selectedInvoice: DashboardInvoice | null;
	modalState: InvoiceDialogState;
	paymentAccountId: string;
	setPaymentAccountId: (accountId: string) => void;
	paymentDate: Date;
	setPaymentDate: (date: Date) => void;
	paidAmount: string;
	setPaidAmount: (amount: string) => void;
};

export function useInvoicesWidgetController(
	invoices: DashboardInvoice[],
): InvoicesWidgetController {
	const [paymentAccountId, setPaymentAccountId] = useState<string>("");
	const [paymentDate, setPaymentDate] = useState<Date>(() => new Date());
	const [paidAmount, setPaidAmount] = useState<string>("");

	const paymentAccountIdRef = useRef(paymentAccountId);
	const paymentDateRef = useRef(paymentDate);
	const paidAmountRef = useRef(paidAmount);
	paymentAccountIdRef.current = paymentAccountId;
	paymentDateRef.current = paymentDate;
	paidAmountRef.current = paidAmount;

	const controller = usePaymentDialogController({
		items: invoices,
		getItemId: (invoice) => invoice.id,
		isItemConfirmed: (invoice) => isInvoicePaid(invoice.paymentStatus),
		executeConfirm: (invoice) => {
			const accountId = paymentAccountIdRef.current || undefined;
			const date = paymentDateRef.current;
			const isoDate = date.toISOString().split("T")[0];
			const parsedPaidAmount = paidAmountRef.current
				? Number(paidAmountRef.current)
				: undefined;

			return updateInvoicePaymentStatusAction({
				cardId: invoice.cardId,
				period: invoice.period,
				status: INVOICE_PAYMENT_STATUS.PAID,
				paymentAccountId: accountId,
				paymentDate: isoDate,
				paidAmount:
					parsedPaidAmount !== undefined && !Number.isNaN(parsedPaidAmount)
						? parsedPaidAmount
						: undefined,
			});
		},
		applyConfirmedState: (invoice) => {
			const parsedPaidAmount = paidAmountRef.current
				? Number(paidAmountRef.current)
				: undefined;
			const paidInvoice = markInvoiceAsPaid(invoice, getCurrentDateString());

			return parsedPaidAmount !== undefined && !Number.isNaN(parsedPaidAmount)
				? { ...paidInvoice, totalAmount: -parsedPaidAmount }
				: paidInvoice;
		},
	});

	const selectedInvoiceId = controller.selectedItem?.id ?? null;
	const selectedDefaultAccountId =
		controller.selectedItem?.defaultPaymentAccountId ?? "";
	const selectedInvoiceAmount = controller.selectedItem?.totalAmount ?? null;

	useEffect(() => {
		if (!selectedInvoiceId) {
			return;
		}
		setPaymentAccountId(selectedDefaultAccountId);
		setPaymentDate(new Date());
		setPaidAmount(
			selectedInvoiceAmount !== null
				? Math.abs(selectedInvoiceAmount).toFixed(2)
				: "",
		);
	}, [selectedInvoiceId, selectedDefaultAccountId, selectedInvoiceAmount]);

	return {
		...controller,
		selectedInvoice: controller.selectedItem,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
		paidAmount,
		setPaidAmount,
	};
}
