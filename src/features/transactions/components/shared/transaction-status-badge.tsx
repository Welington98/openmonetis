import {
	getTransactionStatus,
	TRANSACTION_STATUS_BADGE_CLASSNAMES,
	TRANSACTION_STATUS_LABELS,
	type TransactionStatusInput,
} from "@/features/transactions/lib/transaction-status";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/utils/ui";

type TransactionStatusBadgeProps = TransactionStatusInput & {
	className?: string;
};

export function TransactionStatusBadge({
	className,
	...transaction
}: TransactionStatusBadgeProps) {
	const status = getTransactionStatus(transaction);

	return (
		<Badge
			variant="outline"
			data-status={status}
			className={cn(
				"h-6 rounded-sm border px-2 py-0 text-xs font-medium shadow-xs",
				TRANSACTION_STATUS_BADGE_CLASSNAMES[status],
				className,
			)}
		>
			{TRANSACTION_STATUS_LABELS[status]}
		</Badge>
	);
}
