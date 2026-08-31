import { Badge } from "@/shared/components/ui/badge";
import type { BudgetStatusColor } from "@/shared/lib/budget-status";
import { cn } from "@/shared/utils/ui";

const STATUS_LABEL: Record<BudgetStatusColor, string> = {
	green: "Situação confortável",
	yellow: "Atenção",
	red: "Risco financeiro",
};

const STATUS_CLASS: Record<BudgetStatusColor, string> = {
	green: "bg-success/15 text-success border-success/30",
	yellow: "bg-warning/15 text-warning border-warning/30",
	red: "bg-destructive/15 text-destructive border-destructive/30",
};

type DailyBudgetStatusBadgeProps = {
	status: BudgetStatusColor;
};

export function DailyBudgetStatusBadge({
	status,
}: DailyBudgetStatusBadgeProps) {
	return (
		<Badge
			variant="outline"
			className={cn("font-medium", STATUS_CLASS[status])}
		>
			{STATUS_LABEL[status]}
		</Badge>
	);
}
