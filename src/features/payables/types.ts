import type { DashboardBill } from "@/features/dashboard/bills/bills-queries";
import type { DashboardInvoice } from "@/features/dashboard/invoices/invoices-queries";

/**
 * `DashboardBill` é o formato mínimo esperado pelo widget de boletos do
 * dashboard (reaproveitado aqui). A página de contas a pagar/receber precisa
 * de mais alguns campos (período, pessoa, categoria, forma de pagamento) só
 * para os filtros — por isso estende em vez de duplicar o tipo.
 */
export type PayableBillDetails = DashboardBill & {
	period: string;
	paymentMethod: string;
	payerId: string | null;
	payerName: string | null;
	categoryId: string | null;
	categoryName: string | null;
};

export type PayableRow =
	| {
			kind: "transaction";
			id: string;
			dueDate: string | null;
			amount: number;
			bill: PayableBillDetails;
	  }
	| {
			kind: "invoice";
			id: string;
			dueDate: string | null;
			amount: number;
			invoice: DashboardInvoice;
	  };

export type PayablePaymentAccountOption = {
	value: string;
	label: string;
	logo: string | null;
};

export type PayableFilterOption = {
	value: string;
	label: string;
	icon?: string | null;
	avatarUrl?: string | null;
	group?: string | null;
};

export type PayablesSnapshot = {
	payables: PayableRow[];
	receivables: PayableRow[];
	paymentAccountOptions: PayablePaymentAccountOption[];
	categoryOptions: PayableFilterOption[];
	payerOptions: PayableFilterOption[];
};
