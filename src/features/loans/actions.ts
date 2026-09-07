"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	categories,
	financialAccounts,
	loanInstallments,
	loans,
	transactions,
} from "@/db/schema";
import { generateAmortizationSchedule } from "@/features/loans/lib/amortization";
import { centsToDecimalString, toCents } from "@/features/loans/lib/money";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	isLoanAccountType,
	LOAN_CATEGORY_NAME,
	LOAN_DISBURSEMENT_NOTE_PREFIX,
	resolveLoanDirection,
} from "@/shared/lib/loans/constants";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { requiredDecimalSchema, uuidSchema } from "@/shared/lib/schemas/common";
import {
	addMonthsToDate,
	getBusinessTodayInfo,
	toLocalDateString,
} from "@/shared/utils/date";
import { derivePeriodFromDate } from "@/shared/utils/period";

const LOAN_CATEGORY_ICON = "RiHandCoinLine";

const createLoanSchema = z
	.object({
		accountId: uuidSchema("Conta de empréstimo"),
		paymentAccountId: uuidSchema("Conta de pagamento"),
		principalAmount: requiredDecimalSchema("valor principal"),
		interestRateMonthly: z
			.union([
				z.number(),
				z
					.string()
					.trim()
					.transform((v) => v.replace(",", ".")),
			])
			.transform((value, ctx) => {
				const parsed =
					typeof value === "number" ? value : Number.parseFloat(value);
				if (Number.isNaN(parsed) || parsed < 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: "Informe uma taxa de juros mensal válida.",
					});
					return z.NEVER;
				}
				return parsed;
			}),
		installmentCount: z
			.union([z.number(), z.string()])
			.transform((value) =>
				typeof value === "number" ? value : Number.parseInt(value, 10),
			)
			.refine(
				(value) => Number.isInteger(value) && value >= 1 && value <= 420,
				"Informe um número de parcelas entre 1 e 420.",
			),
		amortizationSystem: z.enum(["price", "sac"], {
			message: "Selecione o sistema de amortização.",
		}),
		firstDueDate: z
			.string({ message: "Informe a data do primeiro vencimento." })
			.trim()
			.min(1, "Informe a data do primeiro vencimento."),
	})
	.refine((data) => data.accountId !== data.paymentAccountId, {
		message: "A conta de pagamento deve ser diferente da conta de empréstimo.",
		path: ["paymentAccountId"],
	});

type CreateLoanInput = z.input<typeof createLoanSchema>;

async function resolveOrCreateLoanCategory(
	tx: typeof db,
	userId: string,
	type: "despesa" | "receita",
) {
	const existing = await tx.query.categories.findFirst({
		columns: { id: true },
		where: and(
			eq(categories.userId, userId),
			eq(categories.type, type),
			eq(categories.name, LOAN_CATEGORY_NAME),
		),
	});

	if (existing) return existing;

	const [created] = await tx
		.insert(categories)
		.values({
			name: LOAN_CATEGORY_NAME,
			type,
			icon: LOAN_CATEGORY_ICON,
			userId,
		})
		.returning({ id: categories.id });

	if (!created) {
		throw new Error("Não foi possível preparar a categoria de empréstimos.");
	}

	return created;
}

export async function createLoanAction(
	input: CreateLoanInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = createLoanSchema.parse(input);

		const firstDueDate = new Date(`${data.firstDueDate}T00:00:00`);
		if (Number.isNaN(firstDueDate.getTime())) {
			throw new Error("Data do primeiro vencimento inválida.");
		}

		const adminPayerId = await getAdminPayerId(user.id);
		if (!adminPayerId) {
			throw new Error(
				"Pessoa com papel administrador não encontrada. Crie uma pessoa admin antes de configurar um empréstimo.",
			);
		}

		await db.transaction(async (tx: typeof db) => {
			const account = await tx.query.financialAccounts.findFirst({
				columns: { id: true, name: true, accountType: true },
				where: and(
					eq(financialAccounts.id, data.accountId),
					eq(financialAccounts.userId, user.id),
				),
			});

			if (!account) {
				throw new Error("Conta de empréstimo não encontrada.");
			}

			const direction = resolveLoanDirection(account.accountType);
			if (!direction || !isLoanAccountType(account.accountType)) {
				throw new Error(
					"Esta conta não é do tipo Empréstimo Contratado ou Empréstimo Concedido.",
				);
			}

			const existingLoan = await tx.query.loans.findFirst({
				columns: { id: true },
				where: eq(loans.accountId, data.accountId),
			});
			if (existingLoan) {
				throw new Error("Este empréstimo já foi configurado.");
			}

			const paymentAccount = await tx.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, data.paymentAccountId),
					eq(financialAccounts.userId, user.id),
				),
			});
			if (!paymentAccount) {
				throw new Error("Conta de pagamento não encontrada.");
			}

			const principalCents = toCents(data.principalAmount);

			const [despesaCategory, receitaCategory] = await Promise.all([
				resolveOrCreateLoanCategory(tx, user.id, "despesa"),
				resolveOrCreateLoanCategory(tx, user.id, "receita"),
			]);

			const [createdLoan] = await tx
				.insert(loans)
				.values({
					userId: user.id,
					accountId: data.accountId,
					direction,
					principalAmount: centsToDecimalString(principalCents),
					interestRateMonthly: data.interestRateMonthly.toFixed(4),
					installmentCount: data.installmentCount,
					amortizationSystem: data.amortizationSystem,
					firstDueDate,
					paymentAccountId: data.paymentAccountId,
				})
				.returning({ id: loans.id });

			if (!createdLoan) {
				throw new Error("Não foi possível criar o empréstimo.");
			}

			// Lançamento de desembolso: sem isso a dívida/recebível "aparece do
			// nada" sem nunca ter mexido em nenhuma conta real.
			const { date: today, period: todayPeriod } = getBusinessTodayInfo();
			const isContratado = direction === "contratado";

			await tx.insert(transactions).values({
				condition: "À vista",
				name: `Empréstimo — desembolso (${account.name})`,
				paymentMethod: "Transferência bancária",
				note: `${LOAN_DISBURSEMENT_NOTE_PREFIX}${data.accountId}`,
				amount: centsToDecimalString(
					isContratado ? principalCents : -principalCents,
				),
				purchaseDate: today,
				transactionType: isContratado ? "Receita" : "Despesa",
				period: todayPeriod,
				isSettled: true,
				userId: user.id,
				accountId: data.paymentAccountId,
				categoryId: isContratado ? receitaCategory.id : despesaCategory.id,
				payerId: adminPayerId,
			});

			const schedule = generateAmortizationSchedule({
				principalCents,
				monthlyRatePercent: data.interestRateMonthly,
				installmentCount: data.installmentCount,
				system: data.amortizationSystem,
			});

			const installmentCategory = isContratado
				? despesaCategory
				: receitaCategory;

			for (const row of schedule) {
				const dueDate = addMonthsToDate(
					firstDueDate,
					row.installmentNumber - 1,
				);
				const dueDateString = toLocalDateString(dueDate);
				const period = derivePeriodFromDate(dueDateString);

				const [installmentTransaction] = await tx
					.insert(transactions)
					.values({
						condition: "À vista",
						name: `Empréstimo — parcela ${row.installmentNumber}/${data.installmentCount} (${account.name})`,
						paymentMethod: "Transferência bancária",
						note: null,
						amount: centsToDecimalString(
							isContratado ? -row.totalAmountCents : row.totalAmountCents,
						),
						purchaseDate: dueDate,
						dueDate,
						transactionType: isContratado ? "Despesa" : "Receita",
						installmentCount: data.installmentCount,
						currentInstallment: row.installmentNumber,
						period,
						isSettled: false,
						costCenterId: null,
						userId: user.id,
						accountId: data.paymentAccountId,
						categoryId: installmentCategory.id,
						payerId: adminPayerId,
					})
					.returning({ id: transactions.id });

				if (!installmentTransaction) {
					throw new Error("Não foi possível gerar as parcelas do empréstimo.");
				}

				await tx.insert(loanInstallments).values({
					loanId: createdLoan.id,
					transactionId: installmentTransaction.id,
					userId: user.id,
					installmentNumber: row.installmentNumber,
					principalAmount: centsToDecimalString(row.principalAmountCents),
					interestAmount: centsToDecimalString(row.interestAmountCents),
					remainingBalanceAfter: centsToDecimalString(
						row.remainingBalanceAfterCents,
					),
					dueDate,
				});
			}
		});

		revalidateForEntity("loans", user.id);
		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Empréstimo configurado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
