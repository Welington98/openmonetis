import { and, eq } from "drizzle-orm";
import { categories, financialAccounts, transactions } from "@/db/schema";
import {
	INITIAL_BALANCE_CATEGORY_NAME,
	INITIAL_BALANCE_CONDITION,
	INITIAL_BALANCE_NOTE,
	INITIAL_BALANCE_PAYMENT_METHOD,
} from "@/shared/lib/accounts/constants";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { TRANSFER_CATEGORY_NAME } from "@/shared/lib/transfers/constants";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { getTodayInfo, parseLocalDateString } from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";
import { normalizeFilePath } from "@/shared/utils/string";
import { buildTransferInstallmentBatches } from "./build-transfer-installment-batches";

export type CreateAccountForUserInput = {
	name: string;
	accountType: string;
	status: string;
	note?: string | null;
	logo: string;
	/** Positivo = credor, negativo = devedor (vira Receita ou Despesa de saldo inicial). */
	initialBalance: number;
	excludeFromBalance: boolean;
	excludeInitialBalanceFromIncome: boolean;
	/** YYYY-MM-DD em que o saldo inicial passou a valer (padrão: hoje). */
	initialBalanceDate?: string;
};

/**
 * Cria uma conta (e o lançamento de saldo inicial, quando diferente de zero)
 * para um usuário já autenticado. Usado pela Server Action
 * `createAccountAction` e pela tool MCP `create_account`.
 */
export async function createAccountForUser(
	userId: string,
	data: CreateAccountForUserInput,
): Promise<{ id: string }> {
	const logoFile = normalizeFilePath(data.logo);

	// O sinal é preservado (positivo = credor, negativo = devedor) — vira
	// Receita ou Despesa no lançamento de saldo inicial abaixo. Vale pra
	// qualquer tipo de conta, inclusive empréstimo (que agora é uma conta
	// comum — o saldo inicial negativo já representa a dívida).
	const normalizedInitialBalance = data.initialBalance;
	const hasInitialBalance = normalizedInitialBalance !== 0;
	const adminPayerId = hasInitialBalance ? await getAdminPayerId(userId) : null;

	if (hasInitialBalance && !adminPayerId) {
		throw new Error(
			"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de definir um saldo inicial.",
		);
	}

	let createdId = "";

	await db.transaction(async (tx: typeof db) => {
		const [createdAccount] = await tx
			.insert(financialAccounts)
			.values({
				name: data.name,
				accountType: data.accountType,
				status: data.status,
				note: data.note ?? null,
				logo: logoFile,
				initialBalance: formatDecimalForDbRequired(normalizedInitialBalance),
				excludeFromBalance: data.excludeFromBalance,
				excludeInitialBalanceFromIncome: data.excludeInitialBalanceFromIncome,
				userId,
			})
			.returning({ id: financialAccounts.id, name: financialAccounts.name });

		if (!createdAccount) {
			throw new Error("Não foi possível criar a conta.");
		}

		createdId = createdAccount.id;

		if (!hasInitialBalance) {
			return;
		}

		const category = await tx.query.categories.findFirst({
			columns: { id: true },
			where: and(
				eq(categories.userId, userId),
				eq(categories.name, INITIAL_BALANCE_CATEGORY_NAME),
			),
		});

		if (!category) {
			throw new Error(
				'Category "Saldo inicial" não encontrada. Crie-a antes de definir um saldo inicial.',
			);
		}

		const { date: todayDate, period: todayPeriod } = getTodayInfo();
		const purchaseDate = data.initialBalanceDate
			? parseLocalDateString(data.initialBalanceDate)
			: todayDate;
		const period = data.initialBalanceDate
			? derivePeriodFromDate(data.initialBalanceDate)
			: todayPeriod;
		const transactionType =
			normalizedInitialBalance < 0 ? "Despesa" : "Receita";

		await tx.insert(transactions).values({
			condition: INITIAL_BALANCE_CONDITION,
			name: `Saldo inicial - ${createdAccount.name}`,
			paymentMethod: INITIAL_BALANCE_PAYMENT_METHOD,
			note: INITIAL_BALANCE_NOTE,
			amount: formatDecimalForDbRequired(normalizedInitialBalance),
			purchaseDate,
			transactionType,
			period,
			isSettled: true,
			userId,
			accountId: createdAccount.id,
			categoryId: category.id,
			payerId: adminPayerId,
		});
	});

	return { id: createdId };
}

export type TransferBetweenAccountsForUserInput = {
	fromAccountId: string;
	toAccountId: string;
	amount: number;
	date: Date;
	/** YYYY-MM do primeiro lançamento. */
	period: string;
	condition: "À vista" | "Parcelado";
	installmentCount: number;
};

/**
 * Registra uma transferência entre duas contas do usuário (um par de
 * lançamentos por parcela). Usado pela Server Action
 * `transferBetweenAccountsAction` e pela tool MCP `create_transfer`.
 */
export async function transferBetweenAccountsForUser(
	userId: string,
	data: TransferBetweenAccountsForUserInput,
): Promise<void> {
	if (data.fromAccountId === data.toAccountId) {
		throw new Error("A conta de origem e destino devem ser diferentes.");
	}

	const adminPayerId = await getAdminPayerId(userId);

	if (!adminPayerId) {
		throw new Error(
			"Pessoa administrador não encontrada. Por favor, crie uma pessoa admin.",
		);
	}

	await db.transaction(async (tx: typeof db) => {
		const [fromAccount, toAccount] = await Promise.all([
			tx.query.financialAccounts.findFirst({
				columns: { id: true, name: true },
				where: and(
					eq(financialAccounts.id, data.fromAccountId),
					eq(financialAccounts.userId, userId),
				),
			}),
			tx.query.financialAccounts.findFirst({
				columns: { id: true, name: true },
				where: and(
					eq(financialAccounts.id, data.toAccountId),
					eq(financialAccounts.userId, userId),
				),
			}),
		]);

		if (!fromAccount) {
			throw new Error("Conta de origem não encontrada.");
		}

		if (!toAccount) {
			throw new Error("Conta de destino não encontrada.");
		}

		const transferCategory = await tx.query.categories.findFirst({
			columns: { id: true },
			where: and(
				eq(categories.userId, userId),
				eq(categories.name, TRANSFER_CATEGORY_NAME),
			),
		});

		if (!transferCategory) {
			throw new Error(
				`Category "${TRANSFER_CATEGORY_NAME}" não encontrada. Por favor, crie esta categoria antes de fazer transferências.`,
			);
		}

		const rows = buildTransferInstallmentBatches({
			fromAccountId: fromAccount.id,
			fromAccountName: fromAccount.name,
			toAccountId: toAccount.id,
			toAccountName: toAccount.name,
			amount: data.amount,
			firstDate: data.date,
			firstPeriod: data.period,
			installmentCount:
				data.condition === "Parcelado" ? data.installmentCount : 1,
			userId,
			adminPayerId,
			transferCategoryId: transferCategory.id,
		});

		// 1 par de lançamentos por parcela, em um único insert em lote.
		await tx.insert(transactions).values(rows);
	});
}
