import type { ReactNode } from "react";
import { BillListItem } from "@/features/dashboard/components/bills/bill-list-item";
import { InvoiceListItem } from "@/features/dashboard/components/invoices/invoice-list-item";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import type { PayableRow } from "../types";

type PayableListProps = {
	rows: PayableRow[];
	onPayBill: (billId: string) => void;
	onPayInvoice: (invoiceId: string) => void;
	emptyIcon: ReactNode;
	emptyTitle: string;
	emptyDescription: string;
};

export function PayableList({
	rows,
	onPayBill,
	onPayInvoice,
	emptyIcon,
	emptyTitle,
	emptyDescription,
}: PayableListProps) {
	if (rows.length === 0) {
		return (
			<WidgetEmptyState
				icon={emptyIcon}
				title={emptyTitle}
				description={emptyDescription}
			/>
		);
	}

	return (
		<ul className="flex flex-col divide-y divide-border">
			{rows.map((row) =>
				row.kind === "transaction" ? (
					<BillListItem key={row.id} bill={row.bill} onPay={onPayBill} />
				) : (
					<InvoiceListItem
						key={row.id}
						invoice={row.invoice}
						onPay={onPayInvoice}
					/>
				),
			)}
		</ul>
	);
}
