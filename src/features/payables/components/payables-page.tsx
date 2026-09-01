"use client";

import { RiCheckboxCircleLine } from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { BillPaymentDialog } from "@/features/dashboard/components/bills/bill-payment-dialog";
import { InvoicePaymentDialog } from "@/features/dashboard/components/invoices/invoice-payment-dialog";
import { useMonthPeriod } from "@/shared/components/month-picker/use-month-period";
import { Tabs, TabsContent } from "@/shared/components/ui/tabs";
import { getBusinessDateString, isDateOnlyPast } from "@/shared/utils/date";
import type {
	PayableFilterOption,
	PayablePaymentAccountOption,
	PayableRow,
} from "../types";
import { PayableList } from "./payable-list";
import {
	CATEGORY_FILTER_PARAM,
	PAYER_FILTER_PARAM,
	PAYMENT_FILTER_PARAM,
	PayablesFilters,
	STATUS_FILTER_PARAM,
} from "./payables-filters";
import { PayablesSidebar } from "./payables-sidebar";
import { PayablesTabs } from "./payables-tabs";
import { usePayablesView } from "./use-payables-view";

type PayablesPageProps = {
	initialTab: "pagar" | "receber";
	payables: PayableRow[];
	receivables: PayableRow[];
	paymentAccountOptions: PayablePaymentAccountOption[];
	categoryOptions: PayableFilterOption[];
	payerOptions: PayableFilterOption[];
};

const getRowAccountId = (row: PayableRow): string | null =>
	row.kind === "transaction"
		? row.bill.accountId
		: row.invoice.defaultPaymentAccountId;

const getRowPeriod = (row: PayableRow): string =>
	row.kind === "transaction" ? row.bill.period : row.invoice.period;

const isRowOverdue = (row: PayableRow, today: string): boolean =>
	row.dueDate !== null && isDateOnlyPast(row.dueDate, today);

const sumAmount = (rows: PayableRow[]): number =>
	rows.reduce((total, row) => total + row.amount, 0);

export function PayablesPage({
	initialTab,
	payables,
	receivables,
	paymentAccountOptions,
	categoryOptions,
	payerOptions,
}: PayablesPageProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const { period } = useMonthPeriod();
	const today = getBusinessDateString();

	const { livePayables, liveReceivables, billController, invoiceController } =
		usePayablesView(payables, receivables);

	const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
		() => new Set(paymentAccountOptions.map((option) => option.value)),
	);
	const allAccountsSelected =
		selectedAccountIds.size >= paymentAccountOptions.length;

	const toggleAccount = (accountId: string) => {
		setSelectedAccountIds((current) => {
			const next = new Set(current);
			if (next.has(accountId)) {
				next.delete(accountId);
			} else {
				next.add(accountId);
			}
			return next;
		});
	};

	const toggleAllAccounts = () => {
		setSelectedAccountIds((current) =>
			current.size >= paymentAccountOptions.length
				? new Set()
				: new Set(paymentAccountOptions.map((option) => option.value)),
		);
	};

	const categoryFilter = searchParams.getAll(CATEGORY_FILTER_PARAM);
	const paymentFilter = searchParams.getAll(PAYMENT_FILTER_PARAM);
	const payerFilter = searchParams.getAll(PAYER_FILTER_PARAM);
	const statusFilter = searchParams.getAll(STATUS_FILTER_PARAM);

	/**
	 * Faturas de cartão não têm categoria/forma de pagamento/pessoa própria
	 * (representam o total de várias compras), então qualquer um desses 3
	 * filtros ativo esconde as faturas da lista — só o filtro de status
	 * (atrasado/agendado), baseado no vencimento, se aplica às duas.
	 */
	const matchesDrawerFilters = (row: PayableRow): boolean => {
		if (row.kind === "transaction") {
			if (
				categoryFilter.length > 0 &&
				!(row.bill.categoryId && categoryFilter.includes(row.bill.categoryId))
			) {
				return false;
			}
			if (
				paymentFilter.length > 0 &&
				!paymentFilter.includes(row.bill.paymentMethod)
			) {
				return false;
			}
			if (
				payerFilter.length > 0 &&
				!(row.bill.payerId && payerFilter.includes(row.bill.payerId))
			) {
				return false;
			}
		} else if (
			categoryFilter.length > 0 ||
			paymentFilter.length > 0 ||
			payerFilter.length > 0
		) {
			return false;
		}

		if (statusFilter.length > 0) {
			const overdue = isRowOverdue(row, today);
			if (!statusFilter.includes(overdue ? "atrasado" : "agendado")) {
				return false;
			}
		}

		return true;
	};

	/** Sempre inclui atrasados, mesmo de períodos passados, mesmo com outro mês selecionado. */
	const matchesPeriod = (row: PayableRow): boolean =>
		getRowPeriod(row) === period || isRowOverdue(row, today);

	const scopedPayables = livePayables
		.filter(matchesPeriod)
		.filter(matchesDrawerFilters);
	const scopedReceivables = liveReceivables
		.filter(matchesPeriod)
		.filter(matchesDrawerFilters);

	const matchesSelectedAccount = (row: PayableRow): boolean => {
		const accountId = getRowAccountId(row);
		return accountId !== null && selectedAccountIds.has(accountId);
	};

	const visiblePayables = scopedPayables.filter(matchesSelectedAccount);
	const visibleReceivables = scopedReceivables.filter(matchesSelectedAccount);

	const activeTabRows =
		initialTab === "pagar" ? scopedPayables : scopedReceivables;
	const accountSummaries = paymentAccountOptions.map((account) => ({
		account,
		amount: sumAmount(
			activeTabRows.filter((row) => getRowAccountId(row) === account.value),
		),
	}));

	const handleTabChange = (nextTab: string) => {
		const nextParams = new URLSearchParams(searchParams.toString());
		if (nextTab === "pagar") {
			nextParams.delete("tab");
		} else {
			nextParams.set("tab", nextTab);
		}
		startTransition(() => {
			const target = nextParams.toString()
				? `${pathname}?${nextParams.toString()}`
				: pathname;
			router.replace(target, { scroll: false });
		});
	};

	return (
		<div className="flex flex-col gap-4 lg:flex-row lg:items-start">
			<PayablesSidebar
				activeTab={initialTab}
				payableTotal={sumAmount(visiblePayables)}
				receivableTotal={sumAmount(visibleReceivables)}
				accountSummaries={accountSummaries}
				selectedAccountIds={selectedAccountIds}
				allAccountsSelected={allAccountsSelected}
				onToggleAccount={toggleAccount}
				onToggleAll={toggleAllAccounts}
			/>

			<div className="min-w-0 flex-1">
				<Tabs
					value={initialTab}
					onValueChange={handleTabChange}
					className="w-full"
				>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<PayablesTabs
							payableCount={visiblePayables.length}
							receivableCount={visibleReceivables.length}
							isPending={isPending}
						/>
						<PayablesFilters
							categoryOptions={categoryOptions}
							payerOptions={payerOptions}
							isPending={isPending}
						/>
					</div>

					<TabsContent value="pagar" className="mt-4">
						<PayableList
							rows={visiblePayables}
							onPayBill={billController.openPaymentDialog}
							onPayInvoice={invoiceController.openPaymentDialog}
							emptyIcon={
								<RiCheckboxCircleLine className="size-6 text-muted-foreground" />
							}
							emptyTitle="Nenhuma conta a pagar"
							emptyDescription="Tudo em dia para os filtros selecionados."
						/>
					</TabsContent>

					<TabsContent value="receber" className="mt-4">
						<PayableList
							rows={visibleReceivables}
							onPayBill={billController.openPaymentDialog}
							onPayInvoice={invoiceController.openPaymentDialog}
							emptyIcon={
								<RiCheckboxCircleLine className="size-6 text-muted-foreground" />
							}
							emptyTitle="Nenhuma conta a receber"
							emptyDescription="Nenhum recebimento pendente para os filtros selecionados."
						/>
					</TabsContent>

					<BillPaymentDialog
						bill={billController.selectedBill}
						open={billController.isModalOpen}
						modalState={billController.modalState}
						isPending={billController.isPending}
						paymentAccountId={billController.paymentAccountId}
						onPaymentAccountChange={billController.setPaymentAccountId}
						paymentDate={billController.paymentDate}
						onPaymentDateChange={billController.setPaymentDate}
						paymentAccountOptions={paymentAccountOptions}
						onClose={billController.closePaymentDialog}
						onConfirm={billController.confirmPayment}
					/>

					<InvoicePaymentDialog
						invoice={invoiceController.selectedInvoice}
						open={invoiceController.isModalOpen}
						modalState={invoiceController.modalState}
						isPending={invoiceController.isPending}
						paymentAccountId={invoiceController.paymentAccountId}
						onPaymentAccountChange={invoiceController.setPaymentAccountId}
						paymentDate={invoiceController.paymentDate}
						onPaymentDateChange={invoiceController.setPaymentDate}
						paymentAccountOptions={paymentAccountOptions}
						onClose={invoiceController.closePaymentDialog}
						onConfirm={invoiceController.confirmPayment}
					/>
				</Tabs>
			</div>
		</div>
	);
}
