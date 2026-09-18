export type DashboardBill = {
	id: string;
	name: string;
	amount: number;
	purchaseDate: string | null;
	dueDate: string | null;
	paymentDate: string | null;
	isSettled: boolean;
	accountId: string | null;
	transactionType: string;
};

export type BillPaymentAccountOption = {
	value: string;
	label: string;
	logo: string | null;
};

export type DashboardBillsSnapshot = {
	bills: DashboardBill[];
	totalPendingAmount: number;
	pendingCount: number;
};
