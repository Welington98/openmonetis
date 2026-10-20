"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { categories, financialAccounts, transactions } from "@/db/schema";
import {
	ACCOUNT_BALANCE_ADJUSTMENT_NAME,
	INITIAL_BALANCE_CONDITION,
	INITIAL_BALANCE_PAYMENT_METHOD,
} from "@/shared/lib/accounts/constants";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { PERIOD_FORMAT_REGEX } from "@/shared/lib/invoices";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { noteSchema, uuidSchema } from "@/shared/lib/schemas/common";
import {
	formatCurrency,
	formatDecimalForDbRequired,
} from "@/shared/utils/currency";
import {
	getBusinessTodayDate,
	parseLocalDateString,
} from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";
import { normalizeFilePath } from "@/shared/utils/string";
import {
	createAccountForUser,
	transferBetweenAccountsForUser,
} from "./lib/account-services";

const ACCOUNT_YIELD_CATEGORY_NAME = "Rendimentos";
const ACCOUNT_YIELD_CATEGORY_ICON = "RiFundsLine";
const ACCOUNT_YIELD_TRANSACTION_NAME = "Rendimento";
const ACCOUNT_YIELD_CONDITION = INITIAL_BALANCE_CONDITION;
const ACCOUNT_YIELD_PAYMENT_METHOD = "Transferência bancária" as const;

const accountBaseSchema = z.object({
	name: z
		.string({ message: "Informe o nome da conta." })
		.trim()
		.min(1, "Informe o nome da conta."),
	accountType: z
		.string({ message: "Informe o tipo da conta." })
		.trim()
		.min(1, "Informe o tipo da conta."),
	status: z
		.string({ message: "Informe o status da conta." })
		.trim()
		.min(1, "Informe o status da conta."),
	note: noteSchema,
	logo: z
		.string({ message: "Selecione um logo." })
		.trim()
		.min(1, "Selecione um logo."),
	initialBalance: z.union([
		z.number(),
		z
			.string()
			.trim()
			.transform((value) =>
				value.length === 0 ? "0" : value.replace(",", "."),
			)
			.refine(
				(value) => !Number.isNaN(Number.parseFloat(value)),
				"Informe um saldo inicial válido.",
			)
			.transform((value) => Number.parseFloat(value)),
	]),
	excludeFromBalance: z
		.union([z.boolean(), z.string()])
		.transform((value) => value === true || value === "true"),
	excludeInitialBalanceFromIncome: z
		.union([z.boolean(), z.string()])
		.transform((value) => value === true || value === "true"),
});

const createAccountSchema = accountBaseSchema.extend({
	// Data em que o saldo inicial passou a valer — usada só pra datar o
	// lançamento "Saldo inicial" gerado na criação da conta. Sem isso, cai no
	// dia de hoje (comportamento anterior).
	initialBalanceDate: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data de saldo inicial válida.")
		.optional(),
});
const updateAccountSchema = accountBaseSchema.extend({
	id: uuidSchema("FinancialAccount"),
});
const deleteAccountSchema = z.object({
	id: uuidSchema("FinancialAccount"),
});

type AccountCreateInput = z.infer<typeof createAccountSchema>;
type AccountUpdateInput = z.infer<typeof updateAccountSchema>;
type AccountDeleteInput = z.infer<typeof deleteAccountSchema>;

export async function createAccountAction(
	input: AccountCreateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = createAccountSchema.parse(input);

		await createAccountForUser(user.id, data);

		revalidateForEntity("accounts", user.id);

		return {
			success: true,
			message: "Conta criada com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function updateAccountAction(
	input: AccountUpdateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateAccountSchema.parse(input);

		const logoFile = normalizeFilePath(data.logo);

		const [updated] = await db
			.update(financialAccounts)
			.set({
				name: data.name,
				accountType: data.accountType,
				status: data.status,
				note: data.note ?? null,
				logo: logoFile,
				initialBalance: formatDecimalForDbRequired(data.initialBalance),
				excludeFromBalance: data.excludeFromBalance,
				excludeInitialBalanceFromIncome: data.excludeInitialBalanceFromIncome,
			})
			.where(
				and(
					eq(financialAccounts.id, data.id),
					eq(financialAccounts.userId, user.id),
				),
			)
			.returning();

		if (!updated) {
			return {
				success: false,
				error: "Conta não encontrada.",
			};
		}

		revalidateForEntity("accounts", user.id);

		return {
			success: true,
			message: "Conta atualizada com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteAccountAction(
	input: AccountDeleteInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteAccountSchema.parse(input);

		const [deleted] = await db.transaction(async (tx: typeof db) => {
			return tx
				.delete(financialAccounts)
				.where(
					and(
						eq(financialAccounts.id, data.id),
						eq(financialAccounts.userId, user.id),
					),
				)
				.returning({ id: financialAccounts.id });
		});

		if (!deleted) {
			return {
				success: false,
				error: "Conta não encontrada.",
			};
		}

		revalidateForEntity("accounts", user.id);

		return {
			success: true,
			message: "Conta removida com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

// Transfer between accounts
const transferSchema = z
	.object({
		fromAccountId: uuidSchema("Conta de origem"),
		toAccountId: uuidSchema("Conta de destino"),
		amount: z
			.string()
			.trim()
			.transform((value) =>
				value.length === 0 ? "0" : value.replace(",", "."),
			)
			.refine(
				(value) => !Number.isNaN(Number.parseFloat(value)),
				"Informe um valor válido.",
			)
			.transform((value) => Number.parseFloat(value))
			.refine((value) => value > 0, "O valor deve ser maior que zero."),
		date: z.coerce.date({ message: "Informe uma data válida." }),
		period: z
			.string({ message: "Informe o período." })
			.trim()
			.min(1, "Informe o período."),
		condition: z.enum(["À vista", "Parcelado"]).default("À vista"),
		installmentCount: z
			.union([z.number(), z.string()])
			.transform((value) =>
				typeof value === "number" ? value : Number.parseInt(value, 10),
			)
			.refine(
				(value) => Number.isInteger(value) && value >= 1 && value <= 420,
				"Informe um número de parcelas entre 1 e 420.",
			)
			.default(1),
	})
	.refine(
		(data) => data.condition !== "Parcelado" || data.installmentCount >= 2,
		{
			message: "Uma transferência parcelada precisa de pelo menos 2 parcelas.",
			path: ["installmentCount"],
		},
	);

type TransferInput = z.input<typeof transferSchema>;

export async function transferBetweenAccountsAction(
	input: TransferInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = transferSchema.parse(input);

		// Validate that accounts are different
		if (data.fromAccountId === data.toAccountId) {
			return {
				success: false,
				error: "A conta de origem e destino devem ser diferentes.",
			};
		}

		await transferBetweenAccountsForUser(user.id, data);

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return {
			success: true,
			message: "Transferência registrada com sucesso.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}

const updateTransferSchema = z.object({
	id: uuidSchema("Lançamento"),
	toAccountId: uuidSchema("Conta de destino"),
	amount: z
		.string()
		.trim()
		.transform((value) => (value.length === 0 ? "0" : value.replace(",", ".")))
		.refine(
			(value) => !Number.isNaN(Number.parseFloat(value)),
			"Informe um valor válido.",
		)
		.transform((value) => Number.parseFloat(value))
		.refine((value) => value > 0, "O valor deve ser maior que zero."),
	date: z.coerce.date({ message: "Informe uma data válida." }),
	period: z
		.string({ message: "Informe o período." })
		.trim()
		.min(1, "Informe o período."),
});

type UpdateTransferInput = z.input<typeof updateTransferSchema>;

/**
 * Edita valor/data/conta de destino de uma transferência já existente — só a
 * partir da perna de SAÍDA (valor negativo); a conta de origem não muda por
 * aqui (mesma trava de UX do `TransferDialog` na criação).
 */
export async function updateTransferAction(
	input: UpdateTransferInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateTransferSchema.parse(input);

		const existing = await db.query.transactions.findFirst({
			where: and(
				eq(transactions.id, data.id),
				eq(transactions.userId, user.id),
			),
		});
		if (!existing) {
			return { success: false, error: "Lançamento não encontrado." };
		}
		if (existing.transactionType !== "Transferência" || !existing.transferId) {
			return {
				success: false,
				error: "Este lançamento não é uma transferência.",
			};
		}
		if (Number(existing.amount) >= 0) {
			return {
				success: false,
				error:
					"Edite a transferência a partir da perna de saída (valor negativo).",
			};
		}
		if (!existing.accountId) {
			return { success: false, error: "Conta de origem não encontrada." };
		}
		if (data.toAccountId === existing.accountId) {
			return {
				success: false,
				error: "A conta de destino deve ser diferente da conta de origem.",
			};
		}

		const sibling = await db.query.transactions.findFirst({
			where: and(
				eq(transactions.transferId, existing.transferId),
				ne(transactions.id, existing.id),
			),
		});
		if (!sibling) {
			return {
				success: false,
				error: "Não foi possível localizar a outra perna dessa transferência.",
			};
		}

		const toAccount = await db.query.financialAccounts.findFirst({
			columns: { id: true },
			where: and(
				eq(financialAccounts.id, data.toAccountId),
				eq(financialAccounts.userId, user.id),
			),
		});
		if (!toAccount) {
			return { success: false, error: "Conta de destino não encontrada." };
		}

		await db.transaction(async (tx: typeof db) => {
			await tx
				.update(transactions)
				.set({
					amount: formatDecimalForDbRequired(-Math.abs(data.amount)),
					purchaseDate: data.date,
					period: data.period,
				})
				.where(eq(transactions.id, existing.id));

			await tx
				.update(transactions)
				.set({
					accountId: data.toAccountId,
					amount: formatDecimalForDbRequired(Math.abs(data.amount)),
					purchaseDate: data.date,
					period: data.period,
				})
				.where(eq(transactions.id, sibling.id));
		});

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Transferência atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

const adjustAccountBalanceSchema = z.object({
	accountId: uuidSchema("FinancialAccount"),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	currentBalance: z.number({ message: "Saldo atual inválido." }),
	targetBalance: z.number({ message: "Saldo correto inválido." }),
});

type AdjustAccountBalanceInput = z.infer<typeof adjustAccountBalanceSchema>;

const addAccountYieldSchema = z.object({
	accountId: uuidSchema("FinancialAccount"),
	amount: z
		.number({ message: "Valor inválido." })
		.positive("Informe um valor maior que zero."),
	date: z
		.string({ message: "Data inválida." })
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/u, "Data inválida."),
});

type AddAccountYieldInput = z.infer<typeof addAccountYieldSchema>;

export async function addAccountYieldAction(
	input: AddAccountYieldInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = addAccountYieldSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			throw new Error(
				"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de adicionar rendimentos.",
			);
		}

		const purchaseDate = parseLocalDateString(data.date);
		if (Number.isNaN(purchaseDate.getTime())) {
			throw new Error("Data inválida.");
		}

		await db.transaction(async (tx: typeof db) => {
			const account = await tx.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.accountId),
					eq(financialAccounts.userId, user.id),
				),
			});

			if (!account) {
				throw new Error("Conta não encontrada.");
			}

			const existingCategory = await tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, user.id),
					eq(categories.type, "receita"),
					eq(categories.name, ACCOUNT_YIELD_CATEGORY_NAME),
				),
			});

			const category =
				existingCategory ??
				(
					await tx
						.insert(categories)
						.values({
							name: ACCOUNT_YIELD_CATEGORY_NAME,
							type: "receita",
							icon: ACCOUNT_YIELD_CATEGORY_ICON,
							userId: user.id,
						})
						.returning({ id: categories.id })
				)[0];

			if (!category) {
				throw new Error(
					"Não foi possível preparar a categoria de rendimentos.",
				);
			}

			await tx.insert(transactions).values({
				condition: ACCOUNT_YIELD_CONDITION,
				name: ACCOUNT_YIELD_TRANSACTION_NAME,
				paymentMethod: ACCOUNT_YIELD_PAYMENT_METHOD,
				note: null,
				amount: formatDecimalForDbRequired(data.amount),
				purchaseDate,
				transactionType: "Receita" as const,
				period: derivePeriodFromDate(data.date),
				isSettled: true,
				userId: user.id,
				accountId: data.accountId,
				cardId: null,
				categoryId: category.id,
				payerId: adminPayerId,
			});
		});

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Rendimento adicionado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function adjustAccountBalanceAction(
	input: AdjustAccountBalanceInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = adjustAccountBalanceSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			throw new Error(
				"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de ajustar o saldo.",
			);
		}

		let message = "Ajuste de saldo registrado.";

		await db.transaction(async (tx: typeof db) => {
			const account = await tx.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.accountId),
					eq(financialAccounts.userId, user.id),
				),
			});

			if (!account) {
				throw new Error("Conta não encontrada.");
			}

			const existing = await tx.query.transactions.findFirst({
				columns: { id: true, amount: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.accountId, data.accountId),
					eq(transactions.period, data.period),
					eq(transactions.name, ACCOUNT_BALANCE_ADJUSTMENT_NAME),
				),
			});

			const existingAmount = Number(existing?.amount ?? 0);
			const baseBalance = data.currentBalance - existingAmount;
			const adjustmentAmount =
				Math.round((data.targetBalance - baseBalance) * 100) / 100;

			if (adjustmentAmount === 0) {
				if (existing) {
					await tx.delete(transactions).where(eq(transactions.id, existing.id));
					message = "Ajuste de saldo removido.";
				} else {
					message = "Nada a ajustar — o saldo já está correto.";
				}
				return;
			}

			const isExpense = adjustmentAmount < 0;
			const categoryName = isExpense ? "Outras despesas" : "Outras receitas";

			const category = await tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, user.id),
					eq(categories.name, categoryName),
				),
			});

			const amount = formatDecimalForDbRequired(adjustmentAmount);
			const note = `O saldo era ${formatCurrency(baseBalance)} mas o correto é ${formatCurrency(data.targetBalance)}.`;

			const payload = {
				condition: INITIAL_BALANCE_CONDITION,
				name: ACCOUNT_BALANCE_ADJUSTMENT_NAME,
				paymentMethod: INITIAL_BALANCE_PAYMENT_METHOD,
				note,
				amount,
				purchaseDate: getBusinessTodayDate(),
				transactionType: isExpense
					? ("Despesa" as const)
					: ("Receita" as const),
				period: data.period,
				isSettled: true,
				userId: user.id,
				accountId: data.accountId,
				cardId: null,
				categoryId: category?.id ?? null,
				payerId: adminPayerId,
			};

			if (existing) {
				await tx
					.update(transactions)
					.set(payload)
					.where(eq(transactions.id, existing.id));
			} else {
				await tx.insert(transactions).values(payload);
			}
		});

		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message };
	} catch (error) {
		return handleActionError(error);
	}
}
