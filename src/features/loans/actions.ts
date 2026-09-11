"use server";

import { and, eq, inArray } from "drizzle-orm";
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
		// Número da primeira parcela rastreada — 1 pra um empréstimo novo, >1
		// pra um empréstimo que já está em andamento (nesse caso o desembolso
		// não é lançado, ver `createLoanAction`).
		startingInstallmentNumber: z
			.union([z.number(), z.string()])
			.transform((value) =>
				typeof value === "number" ? value : Number.parseInt(value, 10),
			)
			.refine(
				(value) => Number.isInteger(value) && value >= 1 && value <= 420,
				"Informe uma parcela inicial válida.",
			)
			.default(1),
	})
	.refine((data) => data.accountId !== data.paymentAccountId, {
		message: "A conta de pagamento deve ser diferente da conta de empréstimo.",
		path: ["paymentAccountId"],
	})
	.refine((data) => data.startingInstallmentNumber <= data.installmentCount, {
		message:
			"A parcela inicial não pode ser maior que a quantidade de parcelas.",
		path: ["startingInstallmentNumber"],
	});

type CreateLoanInput = z.input<typeof createLoanSchema>;

const updateLoanConfigSchema = createLoanSchema.and(
	z.object({ loanId: uuidSchema("Empréstimo") }),
);

type UpdateLoanConfigInput = z.input<typeof updateLoanConfigSchema>;

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

type InsertLoanScheduleParams = {
	tx: typeof db;
	loanId: string;
	userId: string;
	accountName: string;
	paymentAccountId: string;
	isContratado: boolean;
	principalCents: number;
	interestRateMonthly: number;
	installmentCount: number;
	amortizationSystem: "price" | "sac";
	startingInstallmentNumber: number;
	firstDueDate: Date;
	installmentCategoryId: string;
	adminPayerId: string;
};

/**
 * Gera a tabela de amortização e insere um `transactions` + `loanInstallments`
 * por parcela. Reaproveitado tanto na criação quanto na edição de um
 * empréstimo (edição sempre regera a tabela inteira do zero).
 */
async function insertLoanSchedule({
	tx,
	loanId,
	userId,
	accountName,
	paymentAccountId,
	isContratado,
	principalCents,
	interestRateMonthly,
	installmentCount,
	amortizationSystem,
	startingInstallmentNumber,
	firstDueDate,
	installmentCategoryId,
	adminPayerId,
}: InsertLoanScheduleParams) {
	const schedule = generateAmortizationSchedule({
		principalCents,
		monthlyRatePercent: interestRateMonthly,
		installmentCount,
		system: amortizationSystem,
		startingInstallmentNumber,
	});

	for (const row of schedule) {
		const dueDate = addMonthsToDate(
			firstDueDate,
			row.installmentNumber - startingInstallmentNumber,
		);
		const dueDateString = toLocalDateString(dueDate);
		const period = derivePeriodFromDate(dueDateString);
		const lastInstallmentNumber =
			startingInstallmentNumber + installmentCount - 1;

		const [installmentTransaction] = await tx
			.insert(transactions)
			.values({
				condition: "À vista",
				name: `Empréstimo — parcela ${row.installmentNumber}/${lastInstallmentNumber} (${accountName})`,
				paymentMethod: "Transferência bancária",
				note: null,
				amount: centsToDecimalString(
					isContratado ? -row.totalAmountCents : row.totalAmountCents,
				),
				purchaseDate: dueDate,
				dueDate,
				transactionType: isContratado ? "Despesa" : "Receita",
				installmentCount: lastInstallmentNumber,
				currentInstallment: row.installmentNumber,
				period,
				isSettled: false,
				costCenterId: null,
				userId,
				accountId: paymentAccountId,
				categoryId: installmentCategoryId,
				payerId: adminPayerId,
			})
			.returning({ id: transactions.id });

		if (!installmentTransaction) {
			throw new Error("Não foi possível gerar as parcelas do empréstimo.");
		}

		await tx.insert(loanInstallments).values({
			loanId,
			transactionId: installmentTransaction.id,
			userId,
			installmentNumber: row.installmentNumber,
			principalAmount: centsToDecimalString(row.principalAmountCents),
			interestAmount: centsToDecimalString(row.interestAmountCents),
			remainingBalanceAfter: centsToDecimalString(
				row.remainingBalanceAfterCents,
			),
			dueDate,
		});
	}
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
					startingInstallmentNumber: data.startingInstallmentNumber,
					amortizationSystem: data.amortizationSystem,
					firstDueDate,
					paymentAccountId: data.paymentAccountId,
				})
				.returning({ id: loans.id });

			if (!createdLoan) {
				throw new Error("Não foi possível criar o empréstimo.");
			}

			const isContratado = direction === "contratado";

			// Lançamento de desembolso: sem isso a dívida/recebível "aparece do
			// nada" sem nunca ter mexido em nenhuma conta real. Pulado quando o
			// empréstimo já está em andamento (parcela inicial > 1) — o
			// desembolso real já aconteceu no passado, fora do app.
			if (data.startingInstallmentNumber === 1) {
				const { date: today, period: todayPeriod } = getBusinessTodayInfo();

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
			}

			await insertLoanSchedule({
				tx,
				loanId: createdLoan.id,
				userId: user.id,
				accountName: account.name,
				paymentAccountId: data.paymentAccountId,
				isContratado,
				principalCents,
				interestRateMonthly: data.interestRateMonthly,
				installmentCount: data.installmentCount,
				amortizationSystem: data.amortizationSystem,
				startingInstallmentNumber: data.startingInstallmentNumber,
				firstDueDate,
				installmentCategoryId: isContratado
					? despesaCategory.id
					: receitaCategory.id,
				adminPayerId,
			});
		});

		revalidateForEntity("loans", user.id);
		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Empréstimo configurado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

/**
 * Reconfigura um empréstimo já existente (valor, juros, quantidade de
 * parcelas, sistema, primeiro vencimento, parcela inicial, conta de
 * pagamento). Parcelas já liquidadas NUNCA são tocadas — permanecem como
 * histórico financeiro real, com seu número/valor/data originais. Só as
 * parcelas ainda em aberto são apagadas e regeradas com os novos termos,
 * continuando a numeração logo depois da última parcela paga (quando existe
 * alguma). O lançamento de desembolso original não é alterado.
 */
export async function updateLoanConfigAction(
	input: UpdateLoanConfigInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateLoanConfigSchema.parse(input);

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
			const loan = await tx.query.loans.findFirst({
				where: and(eq(loans.id, data.loanId), eq(loans.userId, user.id)),
			});
			if (!loan || loan.accountId !== data.accountId) {
				throw new Error("Empréstimo não encontrado.");
			}

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
			if (!direction) {
				throw new Error(
					"Esta conta não é do tipo Empréstimo Contratado ou Empréstimo Concedido.",
				);
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

			const existingInstallments = await tx.query.loanInstallments.findMany({
				columns: { transactionId: true, installmentNumber: true },
				where: eq(loanInstallments.loanId, data.loanId),
				with: { transaction: { columns: { isSettled: true } } },
			});

			const settledInstallments = existingInstallments.filter(
				(row) => row.transaction?.isSettled,
			);
			const unsettledInstallments = existingInstallments.filter(
				(row) => !row.transaction?.isSettled,
			);
			const hasSettledInstallments = settledInstallments.length > 0;

			// Enquanto nada foi pago, a parcela inicial informada no formulário
			// vale (empréstimo ainda não "andou"). Assim que existe parcela paga,
			// a numeração histórica é fixa — a regeneração sempre continua logo
			// depois da última parcela liquidada.
			const effectiveStartingInstallmentNumber = hasSettledInstallments
				? Math.max(...settledInstallments.map((row) => row.installmentNumber)) +
					1
				: data.startingInstallmentNumber;

			if (unsettledInstallments.length > 0) {
				await tx.delete(transactions).where(
					inArray(
						transactions.id,
						unsettledInstallments.map((row) => row.transactionId),
					),
				);
			}

			const principalCents = toCents(data.principalAmount);
			const isContratado = direction === "contratado";

			// `installmentCount` guardado no empréstimo é sempre o total rastreado
			// desde `startingInstallmentNumber` original — parcelas já pagas
			// entram nessa conta mesmo sem serem tocadas.
			const totalInstallmentCount = hasSettledInstallments
				? effectiveStartingInstallmentNumber -
					loan.startingInstallmentNumber +
					data.installmentCount
				: data.installmentCount;

			await tx
				.update(loans)
				.set({
					principalAmount: centsToDecimalString(principalCents),
					interestRateMonthly: data.interestRateMonthly.toFixed(4),
					installmentCount: totalInstallmentCount,
					startingInstallmentNumber: hasSettledInstallments
						? loan.startingInstallmentNumber
						: data.startingInstallmentNumber,
					amortizationSystem: data.amortizationSystem,
					firstDueDate,
					paymentAccountId: data.paymentAccountId,
					updatedAt: new Date(),
				})
				.where(eq(loans.id, data.loanId));

			const [despesaCategory, receitaCategory] = await Promise.all([
				resolveOrCreateLoanCategory(tx, user.id, "despesa"),
				resolveOrCreateLoanCategory(tx, user.id, "receita"),
			]);

			await insertLoanSchedule({
				tx,
				loanId: data.loanId,
				userId: user.id,
				accountName: account.name,
				paymentAccountId: data.paymentAccountId,
				isContratado,
				principalCents,
				interestRateMonthly: data.interestRateMonthly,
				// A partir daqui, `data.installmentCount` significa "quantas
				// parcelas regerar a partir da parcela efetiva" — não o total.
				installmentCount: data.installmentCount,
				amortizationSystem: data.amortizationSystem,
				startingInstallmentNumber: effectiveStartingInstallmentNumber,
				firstDueDate,
				installmentCategoryId: isContratado
					? despesaCategory.id
					: receitaCategory.id,
				adminPayerId,
			});
		});

		revalidateForEntity("loans", user.id);
		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Empréstimo atualizado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
