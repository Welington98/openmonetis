import type { ReactNode } from "react";
import { BillListItem } from "@/features/dashboard/components/bills/bill-list-item";
import { InvoiceListItem } from "@/features/dashboard/components/invoices/invoice-list-item";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import type { PayableRow } from "../types";

type PayableListProps = {
	rows: PayableRow[];
	onPayBill: (billId: string) => void;
	onPayInvoice: (invoiceId: string) => void;
	emptyIcon: ReactNode;
	emptyTitle: string;
	emptyDescription: string;
	selectedIds: Set<string>;
	onToggleRow: (id: string) => void;
	onToggleAllRows: (rows: PayableRow[]) => void;
};

export function PayableList({
	rows,
	onPayBill,
	onPayInvoice,
	emptyIcon,
	emptyTitle,
	emptyDescription,
	selectedIds,
	onToggleRow,
	onToggleAllRows,
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

	const selectedCount = rows.filter((row) => selectedIds.has(row.id)).length;
	const allSelected = selectedCount === rows.length;

	return (
		<div className="flex flex-col">
			<div className="flex items-center gap-2 border-b border-border py-1.5">
				<Checkbox
					checked={
						allSelected ? true : selectedCount > 0 ? "indeterminate" : false
					}
					onCheckedChange={() => onToggleAllRows(rows)}
					aria-label="Selecionar todos"
				/>
				<span className="text-xs text-muted-foreground">Selecionar todos</span>
			</div>
			<ul className="flex flex-col divide-y divide-border">
				{rows.map((row) =>
					row.kind === "transaction" ? (
						<BillListItem
							key={row.id}
							bill={row.bill}
							onPay={onPayBill}
							selectable
							selected={selectedIds.has(row.id)}
							onToggleSelect={() => onToggleRow(row.id)}
						/>
					) : (
						<InvoiceListItem
							key={row.id}
							invoice={row.invoice}
							onPay={onPayInvoice}
							selectable
							selected={selectedIds.has(row.id)}
							onToggleSelect={() => onToggleRow(row.id)}
						/>
					),
				)}
			</ul>
		</div>
	);
}
