"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
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
		// Opcional — saldo usado só pra calcular as parcelas, quando o banco
		// parte de uma base diferente do valor desembolsado (ex.: juros de
		// carência capitalizados antes da 1ª parcela). Em branco = usa
		// `principalAmount`, igual ao comportamento anterior a esse campo.
		installmentBaseAmount: z
			.union([z.number(), z.string(), z.null(), z.undefined()])
			.transform((value, ctx) => {
				if (
					value === null ||
					value === undefined ||
					(typeof value === "string" && value.trim().length === 0)
				) {
					return null;
				}
				const parsed =
					typeof value === "number"
						? value
						: Number.parseFloat(value.replace(",", "."));
				if (Number.isNaN(parsed) || parsed <= 0) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"Informe um saldo base válido e maior que zero, ou deixe em branco.",
					});
					return z.NEVER;
				}
				return parsed;
			})
			.optional(),
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

const updateLoanInstallmentDueDateSchema = z.object({
	installmentId: uuidSchema("Parcela"),
	dueDate: z
		.string({ message: "Informe a nova data de vencimento." })
		.trim()
		.min(1, "Informe a nova data de vencimento."),
});

type UpdateLoanInstallmentDueDateInput = z.input<
	typeof updateLoanInstallmentDueDateSchema
>;

const payLoanInstallmentSchema = z.object({
	installmentId: uuidSchema("Parcela"),
	paymentDate: z
		.string({ message: "Informe a data do pagamento." })
		.trim()
		.min(1, "Informe a data do pagamento."),
	paymentAccountId: uuidSchema("Conta de pagamento").optional(),
});

type PayLoanInstallmentInput = z.input<typeof payLoanInstallmentSchema>;

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
	loanAccountId: string;
	paymentAccountId: string;
	isContratado: boolean;
	installmentBaseCents: number;
	interestRateMonthly: number;
	installmentCount: number;
	amortizationSystem: "price" | "sac";
	startingInstallmentNumber: number;
	firstDueDate: Date;
	installmentCategoryId: string;
	adminPayerId: string;
};

/**
 * Gera a tabela de amortização e insere, por parcela: uma transferência
 * (principal) entre a conta de pagamento e a conta de empréstimo — mesmo
 * padrão de `transferBetweenAccountsAction`, com `transactionId` da
 * `loanInstallments` apontando pra perna da conta de pagamento — e, quando
 * há juros, um lançamento de despesa/receita separado só com o valor dos
 * juros (`interestTransactionId`). Reaproveitado tanto na criação quanto na
 * edição de um empréstimo (edição sempre regera a tabela inteira do zero).
 */
async function insertLoanSchedule({
	tx,
	loanId,
	userId,
	accountName,
	loanAccountId,
	paymentAccountId,
	isContratado,
	installmentBaseCents,
	interestRateMonthly,
	installmentCount,
	amortizationSystem,
	startingInstallmentNumber,
	firstDueDate,
	installmentCategoryId,
	adminPayerId,
}: InsertLoanScheduleParams) {
	const schedule = generateAmortizationSchedule({
		principalCents: installmentBaseCents,
		monthlyRatePercent: interestRateMonthly,
		installmentCount,
		system: amortizationSystem,
		startingInstallmentNumber,
	});

	// Pagamento de parcela: o dinheiro sai da conta de pagamento e "entra" na
	// conta de empréstimo (reduzindo a dívida) — sentido oposto ao do
	// desembolso, que sai da conta de empréstimo pra a conta de pagamento.
	const paymentAccountSign = isContratado ? -1 : 1;

	for (const row of schedule) {
		const dueDate = addMonthsToDate(
			firstDueDate,
			row.installmentNumber - startingInstallmentNumber,
		);
		const dueDateString = toLocalDateString(dueDate);
		const period = derivePeriodFromDate(dueDateString);
		const lastInstallmentNumber =
			startingInstallmentNumber + installmentCount - 1;
		const installmentLabel = `${row.installmentNumber}/${lastInstallmentNumber}`;
		const transferId = crypto.randomUUID();

		const sharedTransferFields = {
			condition: "À vista" as const,
			paymentMethod: "Transferência bancária" as const,
			note: null,
			purchaseDate: dueDate,
			dueDate,
			transactionType: "Transferência" as const,
			installmentCount: lastInstallmentNumber,
			currentInstallment: row.installmentNumber,
			period,
			isSettled: false,
			costCenterId: null,
			userId,
			categoryId: installmentCategoryId,
			payerId: adminPayerId,
			transferId,
		};

		const principalTransactionLegs = await tx
			.insert(transactions)
			.values([
				{
					...sharedTransferFields,
					name: `Empréstimo — parcela ${installmentLabel} (${accountName})`,
					amount: centsToDecimalString(
						paymentAccountSign * row.principalAmountCents,
					),
					accountId: paymentAccountId,
				},
				{
					...sharedTransferFields,
					name: `Empréstimo — parcela ${installmentLabel} (${accountName})`,
					amount: centsToDecimalString(
						-paymentAccountSign * row.principalAmountCents,
					),
					accountId: loanAccountId,
				},
			])
			.returning({ id: transactions.id, accountId: transactions.accountId });

		const paymentAccountLeg = principalTransactionLegs.find(
			(leg) => leg.accountId === paymentAccountId,
		);
		if (!paymentAccountLeg) {
			throw new Error("Não foi possível gerar as parcelas do empréstimo.");
		}

		let interestTransactionId: string | null = null;
		if (row.interestAmountCents > 0) {
			const [interestTransaction] = await tx
				.insert(transactions)
				.values({
					condition: "À vista",
					name: `Empréstimo — juros parcela ${installmentLabel} (${accountName})`,
					paymentMethod: "Transferência bancária",
					note: null,
					amount: centsToDecimalString(
						paymentAccountSign * row.interestAmountCents,
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

			if (!interestTransaction) {
				throw new Error("Não foi possível gerar os juros da parcela.");
			}
			interestTransactionId = interestTransaction.id;
		}

		await tx.insert(loanInstallments).values({
			loanId,
			transactionId: paymentAccountLeg.id,
			interestTransactionId,
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
			const installmentBaseCents =
				data.installmentBaseAmount != null
					? toCents(data.installmentBaseAmount)
					: principalCents;

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
					installmentBaseAmount:
						data.installmentBaseAmount != null
							? centsToDecimalString(installmentBaseCents)
							: null,
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

			// Lançamento de desembolso, modelado como uma transferência real entre
			// a conta de empréstimo (origem) e a conta de pagamento (destino) —
			// mesmo padrão de `transferBetweenAccountsAction`. Sem isso a dívida/
			// recebível "aparece do nada" sem nunca ter mexido em nenhuma conta
			// real. Pulado quando o empréstimo já está em andamento (parcela
			// inicial > 1) — o desembolso real já aconteceu no passado, fora do
			// app.
			if (data.startingInstallmentNumber === 1) {
				const { date: today, period: todayPeriod } = getBusinessTodayInfo();
				const disbursementTransferId = crypto.randomUUID();
				const disbursementCategoryId = isContratado
					? receitaCategory.id
					: despesaCategory.id;
				const paymentAccountSign = isContratado ? 1 : -1;

				await tx.insert(transactions).values([
					{
						condition: "À vista",
						name: `Empréstimo — desembolso (${account.name})`,
						paymentMethod: "Transferência bancária",
						note: `${LOAN_DISBURSEMENT_NOTE_PREFIX}${data.accountId}`,
						amount: centsToDecimalString(paymentAccountSign * principalCents),
						purchaseDate: today,
						transactionType: "Transferência",
						period: todayPeriod,
						isSettled: true,
						userId: user.id,
						accountId: data.paymentAccountId,
						categoryId: disbursementCategoryId,
						payerId: adminPayerId,
						transferId: disbursementTransferId,
					},
					{
						condition: "À vista",
						name: `Empréstimo — desembolso (${account.name})`,
						paymentMethod: "Transferência bancária",
						note: null,
						amount: centsToDecimalString(-paymentAccountSign * principalCents),
						purchaseDate: today,
						transactionType: "Transferência",
						period: todayPeriod,
						isSettled: true,
						userId: user.id,
						accountId: data.accountId,
						categoryId: disbursementCategoryId,
						payerId: adminPayerId,
						transferId: disbursementTransferId,
					},
				]);
			}

			await insertLoanSchedule({
				tx,
				loanId: createdLoan.id,
				userId: user.id,
				accountName: account.name,
				loanAccountId: account.id,
				paymentAccountId: data.paymentAccountId,
				isContratado,
				installmentBaseCents,
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
				columns: {
					transactionId: true,
					interestTransactionId: true,
					installmentNumber: true,
				},
				where: eq(loanInstallments.loanId, data.loanId),
				with: {
					transaction: { columns: { isSettled: true, transferId: true } },
				},
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
				// Cada parcela não liquidada tem até 3 linhas: a perna de
				// transferência-saída (`transactionId`), a de transferência-entrada
				// (mesmo `transferId`, na conta de empréstimo) e, quando há juros,
				// uma despesa/receita separada (`interestTransactionId`). Apagar só
				// `transactionId` deixaria as outras duas órfãs — o cascade de
				// `loanInstallments` só some quando ELE é apagado, não os irmãos.
				const transferIds = unsettledInstallments
					.map((row) => row.transaction?.transferId)
					.filter((id): id is string => Boolean(id));

				const transferLegs =
					transferIds.length > 0
						? await tx.query.transactions.findMany({
								columns: { id: true },
								where: inArray(transactions.transferId, transferIds),
							})
						: [];

				const transactionIdsToDelete = new Set<string>([
					...unsettledInstallments.map((row) => row.transactionId),
					...unsettledInstallments
						.map((row) => row.interestTransactionId)
						.filter((id): id is string => Boolean(id)),
					...transferLegs.map((leg) => leg.id),
				]);

				await tx
					.delete(transactions)
					.where(inArray(transactions.id, [...transactionIdsToDelete]));
			}

			const principalCents = toCents(data.principalAmount);
			const installmentBaseCents =
				data.installmentBaseAmount != null
					? toCents(data.installmentBaseAmount)
					: principalCents;
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
					installmentBaseAmount:
						data.installmentBaseAmount != null
							? centsToDecimalString(installmentBaseCents)
							: null,
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
				loanAccountId: account.id,
				paymentAccountId: data.paymentAccountId,
				isContratado,
				installmentBaseCents,
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

/**
 * Move o vencimento de UMA parcela específica ainda em aberto — sem mexer em
 * valor, principal, juros ou saldo devedor de nenhuma parcela (a data não
 * entra na matemática da amortização, então mudar só ela nunca desalinha a
 * cadeia de saldo devedor das parcelas seguintes). Bloqueado pra parcelas já
 * pagas, que ficam como histórico real. Pra mudar o VALOR de uma parcela,
 * use "Editar configuração" — editar o valor de uma parcela isolada
 * quebraria a tabela de amortização.
 */
export async function updateLoanInstallmentDueDateAction(
	input: UpdateLoanInstallmentDueDateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateLoanInstallmentDueDateSchema.parse(input);

		const newDueDate = new Date(`${data.dueDate}T00:00:00`);
		if (Number.isNaN(newDueDate.getTime())) {
			throw new Error("Data de vencimento inválida.");
		}

		await db.transaction(async (tx: typeof db) => {
			const installment = await tx.query.loanInstallments.findFirst({
				where: and(
					eq(loanInstallments.id, data.installmentId),
					eq(loanInstallments.userId, user.id),
				),
				with: { transaction: { columns: { id: true, isSettled: true } } },
			});

			if (!installment?.transaction) {
				throw new Error("Parcela não encontrada.");
			}

			if (installment.transaction.isSettled) {
				throw new Error(
					"Não é possível alterar o vencimento de uma parcela já paga.",
				);
			}

			const period = derivePeriodFromDate(toLocalDateString(newDueDate));

			await tx
				.update(loanInstallments)
				.set({ dueDate: newDueDate })
				.where(eq(loanInstallments.id, data.installmentId));

			await tx
				.update(transactions)
				.set({ dueDate: newDueDate, purchaseDate: newDueDate, period })
				.where(eq(transactions.id, installment.transaction.id));
		});

		revalidateForEntity("loans", user.id);
		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Vencimento da parcela atualizado." };
	} catch (error) {
		return handleActionError(error);
	}
}

/**
 * Liquida uma parcela pendente — settla junto as até 3 linhas que a formam
 * (perna de transferência-saída, perna de transferência-entrada na conta de
 * empréstimo, e a de juros quando existe), pra não deixar a transferência
 * meio-liquidada. Não suporta pagar um valor diferente do combinado (v1) —
 * quem precisar disso usa as ferramentas genéricas de ajuste depois.
 */
export async function payLoanInstallmentAction(
	input: PayLoanInstallmentInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = payLoanInstallmentSchema.parse(input);

		const paymentDate = new Date(`${data.paymentDate}T00:00:00`);
		if (Number.isNaN(paymentDate.getTime())) {
			throw new Error("Data de pagamento inválida.");
		}
		const period = derivePeriodFromDate(toLocalDateString(paymentDate));

		await db.transaction(async (tx: typeof db) => {
			const installment = await tx.query.loanInstallments.findFirst({
				where: and(
					eq(loanInstallments.id, data.installmentId),
					eq(loanInstallments.userId, user.id),
				),
				with: {
					loan: { columns: { paymentAccountId: true } },
					transaction: {
						columns: { id: true, isSettled: true, transferId: true },
					},
				},
			});

			if (!installment?.transaction || !installment.loan) {
				throw new Error("Parcela não encontrada.");
			}

			if (installment.transaction.isSettled) {
				throw new Error("Esta parcela já foi paga.");
			}

			const paymentAccountId =
				data.paymentAccountId ?? installment.loan.paymentAccountId;

			const paymentAccount = await tx.query.financialAccounts.findFirst({
				columns: { id: true },
				where: and(
					eq(financialAccounts.id, paymentAccountId),
					eq(financialAccounts.userId, user.id),
				),
			});
			if (!paymentAccount) {
				throw new Error("Conta de pagamento não encontrada.");
			}

			const transferInLeg = installment.transaction.transferId
				? await tx.query.transactions.findFirst({
						columns: { id: true },
						where: and(
							eq(transactions.transferId, installment.transaction.transferId),
							ne(transactions.id, installment.transaction.id),
						),
					})
				: null;

			await tx
				.update(transactions)
				.set({
					isSettled: true,
					purchaseDate: paymentDate,
					period,
					accountId: paymentAccountId,
				})
				.where(eq(transactions.id, installment.transaction.id));

			if (transferInLeg) {
				await tx
					.update(transactions)
					.set({ isSettled: true, purchaseDate: paymentDate, period })
					.where(eq(transactions.id, transferInLeg.id));
			}

			if (installment.interestTransactionId) {
				await tx
					.update(transactions)
					.set({
						isSettled: true,
						purchaseDate: paymentDate,
						period,
						accountId: paymentAccountId,
					})
					.where(eq(transactions.id, installment.interestTransactionId));
			}
		});

		revalidateForEntity("loans", user.id);
		revalidateForEntity("accounts", user.id);
		revalidateForEntity("transactions", user.id);

		return { success: true, message: "Parcela paga com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}
