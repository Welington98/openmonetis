import { and, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import {
	cards,
	categories,
	financialAccounts,
	invoices,
	payers,
	transactions,
} from "@/db/schema";
import type { DashboardInvoice } from "@/features/dashboard/invoices/invoices-queries";
import { CREDIT_CARD_PAYMENT_METHOD } from "@/features/transactions/lib/constants";
import { db } from "@/shared/lib/db";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";
import {
	buildDateOnlyStringFromPeriodDay,
	toDateOnlyString,
} from "@/shared/utils/date";
import { sortByFinancialUrgency } from "@/shared/utils/financial-dates";
import { safeToNumber as toNumber } from "@/shared/utils/number";
import type {
	PayableBillDetails,
	PayableFilterOption,
	PayablePaymentAccountOption,
	PayableRow,
	PayablesSnapshot,
} from "./types";

/**
 * Lançamentos pendentes (não liquidados) de um tipo, excluindo cartão de
 * crédito — a dívida de cartão entra na lista como uma linha por fatura
 * pendente (ver `fetchPendingCardInvoices`), não por lançamento individual.
 */
async function fetchPendingBills(
	userId: string,
	transactionType: "Despesa" | "Receita",
): Promise<PayableBillDetails[]> {
	const rows = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			amount: transactions.amount,
			dueDate: transactions.dueDate,
			accountId: transactions.accountId,
			transactionType: transactions.transactionType,
			period: transactions.period,
			paymentMethod: transactions.paymentMethod,
			payerId: transactions.payerId,
			payerName: payers.name,
			categoryId: transactions.categoryId,
			categoryName: categories.name,
		})
		.from(transactions)
		.leftJoin(payers, eq(payers.id, transactions.payerId))
		.leftJoin(categories, eq(categories.id, transactions.categoryId))
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.transactionType, transactionType),
				eq(transactions.isSettled, false),
				ne(transactions.paymentMethod, CREDIT_CARD_PAYMENT_METHOD),
			),
		);

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		amount: Math.abs(toNumber(row.amount)),
		dueDate: toDateOnlyString(row.dueDate),
		boletoPaymentDate: null,
		isSettled: false,
		accountId: row.accountId ?? null,
		transactionType: row.transactionType,
		period: row.period,
		paymentMethod: row.paymentMethod,
		payerId: row.payerId ?? null,
		payerName: row.payerName ?? null,
		categoryId: row.categoryId ?? null,
		categoryName: row.categoryName ?? null,
	}));
}

/**
 * Uma linha por fatura de cartão em aberto (cardId + period), somando todas
 * as transações daquele cartão no período — inclui faturas de períodos
 * passados, não só a do mês atual (diferente de `fetchDashboardInvoices`,
 * que é restrita a um único período).
 */
async function fetchPendingCardInvoices(
	userId: string,
): Promise<DashboardInvoice[]> {
	const rows = await db
		.select({
			cardId: cards.id,
			cardName: cards.name,
			cardBrand: cards.brand,
			cardStatus: cards.status,
			logo: cards.logo,
			dueDay: cards.dueDay,
			accountId: cards.accountId,
			period: transactions.period,
			totalAmount: sql<number | null>`coalesce(sum(${transactions.amount}), 0)`,
		})
		.from(transactions)
		.innerJoin(cards, eq(cards.id, transactions.cardId))
		.leftJoin(
			invoices,
			and(
				eq(invoices.userId, transactions.userId),
				eq(invoices.cardId, transactions.cardId),
				eq(invoices.period, transactions.period),
			),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				isNotNull(transactions.cardId),
				or(
					isNull(invoices.paymentStatus),
					ne(invoices.paymentStatus, INVOICE_PAYMENT_STATUS.PAID),
				),
			),
		)
		.groupBy(
			cards.id,
			cards.name,
			cards.brand,
			cards.status,
			cards.logo,
			cards.dueDay,
			cards.accountId,
			transactions.period,
		);

	return rows
		.filter((row) => Math.abs(toNumber(row.totalAmount)) > 0.001)
		.map((row) => ({
			id: `${row.cardId}:${row.period}`,
			cardId: row.cardId,
			cardName: row.cardName,
			cardBrand: row.cardBrand,
			cardStatus: row.cardStatus,
			logo: row.logo,
			dueDay: row.dueDay,
			period: row.period,
			paymentStatus: INVOICE_PAYMENT_STATUS.PENDING,
			totalAmount: toNumber(row.totalAmount),
			paidAt: null,
			pagadorBreakdown: [],
			defaultPaymentAccountId: row.accountId ?? null,
		}));
}

async function fetchPaymentAccountOptions(
	userId: string,
): Promise<PayablePaymentAccountOption[]> {
	const accountRows = await db
		.select({
			id: financialAccounts.id,
			name: financialAccounts.name,
			logo: financialAccounts.logo,
		})
		.from(financialAccounts)
		.where(eq(financialAccounts.userId, userId));

	return accountRows
		.map((account) => ({
			value: account.id,
			label: account.name,
			logo: account.logo,
		}))
		.sort((a, b) =>
			a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
		);
}

async function fetchCategoryOptions(
	userId: string,
): Promise<PayableFilterOption[]> {
	const categoryRows = await db
		.select({
			id: categories.id,
			name: categories.name,
			type: categories.type,
			icon: categories.icon,
		})
		.from(categories)
		.where(eq(categories.userId, userId));

	return categoryRows
		.map((category) => ({
			value: category.id,
			label: category.name,
			icon: category.icon,
			group: category.type === "Receita" ? "Receitas" : "Despesas",
		}))
		.sort((a, b) =>
			a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
		);
}

async function fetchPayerOptions(
	userId: string,
): Promise<PayableFilterOption[]> {
	const payerRows = await db
		.select({
			id: payers.id,
			name: payers.name,
			avatarUrl: payers.avatarUrl,
		})
		.from(payers)
		.where(eq(payers.userId, userId));

	return payerRows
		.map((payer) => ({
			value: payer.id,
			label: payer.name,
			avatarUrl: payer.avatarUrl,
		}))
		.sort((a, b) =>
			a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
		);
}

function buildPayableRows({
	bills,
	invoiceItems,
}: {
	bills: PayableBillDetails[];
	invoiceItems: DashboardInvoice[];
}): PayableRow[] {
	const billRows: PayableRow[] = bills.map((bill) => ({
		kind: "transaction",
		id: bill.id,
		dueDate: bill.dueDate,
		amount: bill.amount,
		bill,
	}));

	const invoiceRows: PayableRow[] = invoiceItems.map((invoice) => ({
		kind: "invoice",
		id: invoice.id,
		dueDate: buildDateOnlyStringFromPeriodDay(invoice.period, invoice.dueDay),
		amount: Math.abs(invoice.totalAmount),
		invoice,
	}));

	return sortByFinancialUrgency([...billRows, ...invoiceRows], {
		isSettled: () => false,
		dueDate: (row) => row.dueDate,
		settledDate: () => null,
		amount: (row) => row.amount,
		tieBreak: (a, b) => {
			const nameA = a.kind === "transaction" ? a.bill.name : a.invoice.cardName;
			const nameB = b.kind === "transaction" ? b.bill.name : b.invoice.cardName;
			return nameA.localeCompare(nameB, "pt-BR");
		},
	});
}

export async function fetchPayablesSnapshot(
	userId: string,
): Promise<PayablesSnapshot> {
	const [
		expenseBills,
		incomeBills,
		invoiceItems,
		paymentAccountOptions,
		categoryOptions,
		payerOptions,
	] = await Promise.all([
		fetchPendingBills(userId, "Despesa"),
		fetchPendingBills(userId, "Receita"),
		fetchPendingCardInvoices(userId),
		fetchPaymentAccountOptions(userId),
		fetchCategoryOptions(userId),
		fetchPayerOptions(userId),
	]);

	return {
		payables: buildPayableRows({ bills: expenseBills, invoiceItems }),
		receivables: buildPayableRows({ bills: incomeBills, invoiceItems: [] }),
		paymentAccountOptions,
		categoryOptions,
		payerOptions,
	};
}
