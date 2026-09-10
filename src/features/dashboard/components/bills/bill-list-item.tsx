import { RiCheckboxCircleFill } from "@remixicon/react";
import Link from "next/link";
import {
	buildBillStatusLabel,
	buildBillWidgetStatusLabel,
	formatBillWidgetOverdueLabel,
	isBillOverdue,
	isIncomeBill,
} from "@/features/dashboard/bills/bills-helpers";
import type { DashboardBill } from "@/features/dashboard/bills/bills-queries";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import { EstablishmentLogo } from "@/shared/components/entity-avatar";
import MoneyValues from "@/shared/components/money-values";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatDateOnly } from "@/shared/utils/date";
import { formatPeriodForUrl, getCurrentPeriod } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

type BillListItemProps = {
	bill: DashboardBill;
	period?: string;
	onPay: (billId: string) => void;
	selectable?: boolean;
	selected?: boolean;
	onToggleSelect?: () => void;
};

function buildTransactionsHref(name: string, period?: string): string {
	const params = new URLSearchParams({ q: name });
	const current = getCurrentPeriod();
	if (period && period !== current) {
		params.set("periodo", formatPeriodForUrl(period));
	}
	return `/transactions?${params.toString()}`;
}

export function BillListItem({
	bill,
	period,
	onPay,
	selectable = false,
	selected = false,
	onToggleSelect,
}: BillListItemProps) {
	const statusLabel = buildBillWidgetStatusLabel(bill);
	const absoluteStatusLabel = buildBillStatusLabel(bill);
	const overdue = isBillOverdue(bill);
	const income = isIncomeBill(bill);
	const overdueLabel = formatBillWidgetOverdueLabel(bill);
	const statusTooltipLabel =
		overdueLabel || (statusLabel && statusLabel !== absoluteStatusLabel)
			? absoluteStatusLabel
			: null;
	const href = buildTransactionsHref(bill.name, period);
	const purchaseDateLabel = formatDateOnly(bill.purchaseDate, {
		year: undefined,
	});

	return (
		<li className={styles.row}>
			<div className={styles.main}>
				{selectable ? (
					<Checkbox
						checked={selected}
						onCheckedChange={() => onToggleSelect?.()}
						aria-label={`Selecionar ${bill.name}`}
					/>
				) : null}
				<EstablishmentLogo name={bill.name} size={37} />

				<div className={styles.textStack}>
					<Link href={href} className={styles.titleLink}>
						<span className="truncate">{bill.name}</span>
					</Link>
					<div className={styles.meta}>
						{purchaseDateLabel ? <span>{purchaseDateLabel}</span> : null}
						{statusLabel ? (
							statusTooltipLabel ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<span
											className={cn(
												"cursor-help",
												bill.isSettled && "text-success font-semibold",
												overdue && "text-destructive font-semibold",
											)}
										>
											{overdueLabel ?? statusLabel}
										</span>
									</TooltipTrigger>
									<TooltipContent side="top">
										{statusTooltipLabel}
									</TooltipContent>
								</Tooltip>
							) : (
								<span
									className={cn(
										bill.isSettled && "text-success font-semibold",
										overdue && "text-destructive font-semibold",
									)}
								>
									{overdueLabel ?? statusLabel}
								</span>
							)
						) : null}
					</div>
				</div>
			</div>

			<div className={styles.trailing}>
				<MoneyValues className={styles.trailingValue} amount={bill.amount} />
				{bill.isSettled ? (
					<span className={`${styles.trailingMeta} text-success`}>
						<RiCheckboxCircleFill className="size-3.5" />{" "}
						{income ? "Recebido" : "Pago"}
					</span>
				) : (
					<Button
						type="button"
						size="sm"
						variant="link"
						className={styles.actionButton}
						onClick={() => onPay(bill.id)}
					>
						{overdue ? (
							<span className="overdue-blink">
								<span className="overdue-blink-primary text-destructive">
									{income ? "Atrasada" : "Atrasado"}
								</span>
								<span className="overdue-blink-secondary">
									{income ? "Receber" : "Pagar"}
								</span>
							</span>
						) : income ? (
							"Receber"
						) : (
							"Pagar"
						)}
					</Button>
				)}
			</div>
		</li>
	);
}
