"use client";

import type {
	BillPaymentAccountOption,
	DashboardBill,
} from "@/features/dashboard/bills/bills-queries";
import { useBillWidgetController } from "@/features/dashboard/bills/use-bill-widget-controller";
import { BillsWidgetView } from "../bills/bills-widget-view";

type BillWidgetProps = {
	bills?: DashboardBill[];
	paymentAccountOptions?: BillPaymentAccountOption[];
	period?: string;
};

const EMPTY_OPTIONS: BillPaymentAccountOption[] = [];

export function BillWidget({
	bills,
	paymentAccountOptions = EMPTY_OPTIONS,
	period,
}: BillWidgetProps) {
	const {
		items,
		selectedBill,
		isModalOpen,
		modalState,
		isPending,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
		paidAmount,
		setPaidAmount,
		openPaymentDialog,
		closePaymentDialog,
		confirmPayment,
	} = useBillWidgetController(bills);

	return (
		<BillsWidgetView
			bills={items}
			period={period}
			selectedBill={selectedBill}
			isModalOpen={isModalOpen}
			modalState={modalState}
			isPending={isPending}
			paymentAccountId={paymentAccountId}
			onPaymentAccountChange={setPaymentAccountId}
			paymentDate={paymentDate}
			onPaymentDateChange={setPaymentDate}
			paidAmount={paidAmount}
			onPaidAmountChange={setPaidAmount}
			paymentAccountOptions={paymentAccountOptions}
			onOpenPaymentDialog={openPaymentDialog}
			onClosePaymentDialog={closePaymentDialog}
			onConfirmPayment={confirmPayment}
		/>
	);
}
