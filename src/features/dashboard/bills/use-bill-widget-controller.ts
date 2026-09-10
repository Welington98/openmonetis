"use client";

import { useEffect, useRef, useState } from "react";
import {
	type BillDialogState,
	getCurrentBillDateString,
	markBillAsSettled,
} from "@/features/dashboard/bills/bills-helpers";
import type { DashboardBill } from "@/features/dashboard/bills/bills-queries";
import {
	type PaymentDialogController,
	usePaymentDialogController,
} from "@/features/dashboard/payments/use-payment-dialog-controller";
import { toggleTransactionSettlementAction } from "@/features/transactions/actions";

const EMPTY_BILLS: DashboardBill[] = [];

type BillWidgetController = Omit<
	PaymentDialogController<DashboardBill>,
	"selectedItem"
> & {
	selectedBill: DashboardBill | null;
	modalState: BillDialogState;
	paymentAccountId: string;
	setPaymentAccountId: (accountId: string) => void;
	paymentDate: Date;
	setPaymentDate: (date: Date) => void;
	paidAmount: string;
	setPaidAmount: (amount: string) => void;
};

const toIsoDate = (date: Date) => date.toISOString().split("T")[0] ?? "";

export function useBillWidgetController(
	bills?: DashboardBill[],
): BillWidgetController {
	const safeBills = bills ?? EMPTY_BILLS;
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
		items: safeBills,
		getItemId: (bill) => bill.id,
		isItemConfirmed: (bill) => bill.isSettled,
		executeConfirm: (bill) => {
			const parsedPaidAmount = paidAmountRef.current
				? Number(paidAmountRef.current)
				: undefined;

			return toggleTransactionSettlementAction({
				id: bill.id,
				value: true,
				paymentAccountId: paymentAccountIdRef.current || null,
				paymentDate: toIsoDate(paymentDateRef.current),
				paidAmount:
					parsedPaidAmount !== undefined && !Number.isNaN(parsedPaidAmount)
						? parsedPaidAmount
						: undefined,
			});
		},
		applyConfirmedState: (bill) => {
			const parsedPaidAmount = paidAmountRef.current
				? Number(paidAmountRef.current)
				: undefined;

			return markBillAsSettled(
				{
					...bill,
					accountId: paymentAccountIdRef.current || bill.accountId,
					amount:
						parsedPaidAmount !== undefined && !Number.isNaN(parsedPaidAmount)
							? parsedPaidAmount
							: bill.amount,
				},
				toIsoDate(paymentDateRef.current) || getCurrentBillDateString(),
			);
		},
	});

	const selectedBillId = controller.selectedItem?.id ?? null;
	const selectedBillAccountId = controller.selectedItem?.accountId ?? "";
	const selectedBillAmount = controller.selectedItem?.amount ?? null;

	useEffect(() => {
		if (!selectedBillId) {
			return;
		}
		setPaymentAccountId(selectedBillAccountId ?? "");
		setPaymentDate(new Date());
		setPaidAmount(
			selectedBillAmount !== null ? selectedBillAmount.toFixed(2) : "",
		);
	}, [selectedBillId, selectedBillAccountId, selectedBillAmount]);

	return {
		...controller,
		selectedBill: controller.selectedItem,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
		paidAmount,
		setPaidAmount,
	};
}
