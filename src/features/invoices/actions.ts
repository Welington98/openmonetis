"use server";

import { and, eq, like, sql } from "drizzle-orm";
import { z } from "zod";
import {
	cards,
	categories,
	financialAccounts,
	invoices,
	transactions,
} from "@/db/schema";
import { generateAmortizationSchedule } from "@/features/loans/lib/amortization";
import {
	buildCarryOverNote,
	buildInstallmentInvoiceName,
	buildInstallmentInvoiceNote,
	buildInstallmentInvoiceNotePrefix,
	buildInvoicePaymentNote,
	CARRY_OVER_TRANSACTION_NAME,
	INVOICE_ADJUSTMENT_NAME,
} from "@/shared/lib/accounts/constants";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import {
	INVOICE_PAYMENT_STATUS,
	PERIOD_FORMAT_REGEX,
} from "@/shared/lib/invoices";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import {
	formatCurrency,
	formatDecimalForDbRequired,
} from "@/shared/utils/currency";
import {
	getBusinessTodayDate,
	parseLocalDateString,
} from "@/shared/utils/date";
import { addMonthsToPeriod } from "@/shared/utils/period";

const isValidPaymentDate = (value: string) =>
	!Number.isNaN(parseLocalDateString(value).getTime());

// Esta action é o toggle binário original (pago ⇄ pendente/desfazer). Os
// status "parcial" e "parcelado" só são atribuídos por
// `payInvoicePartiallyAction`/`installInvoiceAction` — por isso o enum aqui
// fica restrito aos 2 valores originais, mesmo com `InvoicePaymentStatus`
// agora tendo 4 valores possíveis.
const BINARY_INVOICE_STATUSES = [
	INVOICE_PAYMENT_STATUS.PENDING,
	INVOICE_PAYMENT_STATUS.PAID,
] as const;

const updateInvoicePaymentStatusSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	status: z.enum(BINARY_INVOICE_STATUSES),
	paymentDate: z
		.string()
		.optional()
		.refine((value) => !value || isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
	paymentAccountId: z
		.string({ message: "Conta inválida." })
		.uuid("Conta inválida.")
		.nullable()
		.optional(),
});

type UpdateInvoicePaymentStatusInput = z.infer<
	typeof updateInvoicePaymentStatusSchema
>;

type ActionResult =
	| { success: true; message: string }
	| { success: false; error: string };

const successMessageByStatus: Record<
	(typeof BINARY_INVOICE_STATUSES)[number],
	string
> = {
	[INVOICE_PAYMENT_STATUS.PAID]: "Fatura marcada como paga.",
	[INVOICE_PAYMENT_STATUS.PENDING]: "Pagamento da fatura foi revertido.",
};

export async function updateInvoicePaymentStatusAction(
	input: UpdateInvoicePaymentStatusInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateInvoicePaymentStatusSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true, accountId: true, name: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			await tx
				.insert(invoices)
				.values({
					cardId: data.cardId,
					period: data.period,
					paymentStatus: data.status,
					userId: user.id,
				})
				.onConflictDoUpdate({
					target: [invoices.userId, invoices.cardId, invoices.period],
					set: {
						paymentStatus: data.status,
					},
				});

			const shouldMarkAsPaid = data.status === INVOICE_PAYMENT_STATUS.PAID;

			await tx
				.update(transactions)
				.set({ isSettled: shouldMarkAsPaid })
				.where(
					and(
						eq(transactions.userId, user.id),
						eq(transactions.cardId, card.id),
						eq(transactions.period, data.period),
					),
				);

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);

			if (shouldMarkAsPaid) {
				const [adminShareRow] = adminPayerId
					? await tx
							.select({
								total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
							})
							.from(transactions)
							.where(
								and(
									eq(transactions.userId, user.id),
									eq(transactions.cardId, card.id),
									eq(transactions.period, data.period),
									eq(transactions.payerId, adminPayerId),
								),
							)
					: [{ total: 0 }];

				const adminShare = Number(adminShareRow?.total ?? 0);
				const adminPayableAmount = Math.abs(Math.min(adminShare, 0));
				const paymentAccountId = data.paymentAccountId ?? card.accountId;

				if (adminPayerId) {
					if (!paymentAccountId) {
						throw new Error("Selecione uma conta para pagar a fatura.");
					}

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

					const paymentCategory = await tx.query.categories.findFirst({
						columns: { id: true },
						where: and(
							eq(categories.userId, user.id),
							eq(categories.name, "Pagamentos"),
						),
					});

					const invoiceDate = data.paymentDate
						? parseLocalDateString(data.paymentDate)
						: getBusinessTodayDate();

					const amount = `-${formatDecimalForDbRequired(adminPayableAmount)}`;
					const payload = {
						condition: "À vista",
						name: `Pagamento fatura - ${card.name}`,
						paymentMethod: "Pix",
						note: invoiceNote,
						amount,
						purchaseDate: invoiceDate,
						transactionType: "Despesa" as const,
						period: data.period,
						isSettled: true,
						userId: user.id,
						accountId: paymentAccountId,
						categoryId: paymentCategory?.id ?? null,
						payerId: adminPayerId,
					};

					const existingPayment = await tx.query.transactions.findFirst({
						columns: { id: true },
						where: and(
							eq(transactions.userId, user.id),
							eq(transactions.note, invoiceNote),
						),
					});

					if (existingPayment) {
						await tx
							.update(transactions)
							.set(payload)
							.where(eq(transactions.id, existingPayment.id));
					} else {
						await tx.insert(transactions).values(payload);
					}
				}
			} else {
				await tx
					.delete(transactions)
					.where(
						and(
							eq(transactions.userId, user.id),
							eq(transactions.note, invoiceNote),
						),
					);

				// Desfazer também limpa o que um pagamento parcial ou um
				// parcelamento desta fatura possam ter criado em faturas
				// futuras — "Desfazer pagamento" é o desfazer universal dos
				// 3 fluxos (total, parcial, parcelado).
				await tx
					.delete(transactions)
					.where(
						and(
							eq(transactions.userId, user.id),
							eq(transactions.note, buildCarryOverNote(card.id, data.period)),
						),
					);

				await tx
					.delete(transactions)
					.where(
						and(
							eq(transactions.userId, user.id),
							like(
								transactions.note,
								`${buildInstallmentInvoiceNotePrefix(card.id, data.period)}%`,
							),
						),
					);
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: successMessageByStatus[data.status] };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Erro inesperado.",
		};
	}
}

const updatePaymentDateSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	paymentDate: z
		.string({ message: "Data de pagamento inválida." })
		.refine((value) => isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
});

type UpdatePaymentDateInput = z.infer<typeof updatePaymentDateSchema>;

export async function updatePaymentDateAction(
	input: UpdatePaymentDateInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updatePaymentDateSchema.parse(input);

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);

			const existingPayment = await tx.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.note, invoiceNote),
				),
			});

			if (!existingPayment) {
				throw new Error("Pagamento não encontrado.");
			}

			await tx
				.update(transactions)
				.set({
					purchaseDate: parseLocalDateString(data.paymentDate),
				})
				.where(eq(transactions.id, existingPayment.id));
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Data de pagamento atualizada." };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Erro inesperado.",
		};
	}
}

const adjustInvoiceSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	currentTotal: z.number({ message: "Total atual inválido." }),
	targetAmount: z
		.number({ message: "Valor inválido." })
		.nonnegative("O valor deve ser positivo."),
});

type AdjustInvoiceInput = z.infer<typeof adjustInvoiceSchema>;

export async function adjustInvoiceAction(
	input: AdjustInvoiceInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = adjustInvoiceSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		let message = "Ajuste de fatura registrado.";

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const existing = await tx.query.transactions.findFirst({
				columns: { id: true, amount: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.cardId, data.cardId),
					eq(transactions.period, data.period),
					eq(transactions.name, INVOICE_ADJUSTMENT_NAME),
				),
			});

			const existingAmount = Number(existing?.amount ?? 0);
			const baseTotal = data.currentTotal - existingAmount;
			const targetTotal = -data.targetAmount;
			const adjustmentAmount =
				Math.round((targetTotal - baseTotal) * 100) / 100;

			if (adjustmentAmount === 0) {
				if (existing) {
					await tx.delete(transactions).where(eq(transactions.id, existing.id));
					message = "Ajuste de fatura removido.";
				} else {
					message = "Nada a ajustar — o valor já está correto.";
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

			const note = `O valor era ${formatCurrency(Math.abs(baseTotal))} mas o correto é ${formatCurrency(data.targetAmount)}.`;

			const payload = {
				condition: "À vista",
				name: INVOICE_ADJUSTMENT_NAME,
				paymentMethod: "Cartão de crédito",
				note,
				amount,
				purchaseDate: getBusinessTodayDate(),
				transactionType: isExpense
					? ("Despesa" as const)
					: ("Receita" as const),
				period: data.period,
				userId: user.id,
				cardId: data.cardId,
				accountId: null,
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

		revalidateForEntity("cards", user.id);

		return { success: true, message };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Erro inesperado.",
		};
	}
}

/** Soma (magnitude positiva) da cota do pagador admin num cartão/período — mesmo cálculo usado em `updateInvoicePaymentStatusAction`. */
async function calculateAdminPayableAmount(
	tx: typeof db,
	userId: string,
	cardId: string,
	period: string,
	adminPayerId: string,
): Promise<number> {
	const [row] = await tx
		.select({
			total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
		})
		.from(transactions)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.cardId, cardId),
				eq(transactions.period, period),
				eq(transactions.payerId, adminPayerId),
			),
		);

	return Math.abs(Math.min(Number(row?.total ?? 0), 0));
}

const payInvoicePartiallySchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	amountPaid: z
		.number({ message: "Valor inválido." })
		.positive("O valor pago deve ser maior que zero."),
	paymentDate: z
		.string()
		.optional()
		.refine((value) => !value || isValidPaymentDate(value), {
			message: "Data de pagamento inválida.",
		}),
	paymentAccountId: z
		.string({ message: "Conta inválida." })
		.uuid("Conta inválida.")
		.nullable()
		.optional(),
});

type PayInvoicePartiallyInput = z.infer<typeof payInvoicePartiallySchema>;

export async function payInvoicePartiallyAction(
	input: PayInvoicePartiallyInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = payInvoicePartiallySchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			return {
				success: false,
				error: "Nenhum pagador administrador configurado.",
			};
		}

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true, accountId: true, name: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const adminPayableAmount = await calculateAdminPayableAmount(
				tx,
				user.id,
				card.id,
				data.period,
				adminPayerId,
			);

			if (adminPayableAmount <= 0) {
				throw new Error("Não há valor a pagar nesta fatura.");
			}
			if (data.amountPaid >= adminPayableAmount - 0.005) {
				throw new Error(
					'O valor informado cobre a fatura inteira. Use "Marcar como paga".',
				);
			}

			const paymentAccountId = data.paymentAccountId ?? card.accountId;
			if (!paymentAccountId) {
				throw new Error("Selecione uma conta para pagar a fatura.");
			}

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

			await tx
				.insert(invoices)
				.values({
					cardId: data.cardId,
					period: data.period,
					paymentStatus: INVOICE_PAYMENT_STATUS.PARTIAL,
					userId: user.id,
				})
				.onConflictDoUpdate({
					target: [invoices.userId, invoices.cardId, invoices.period],
					set: { paymentStatus: INVOICE_PAYMENT_STATUS.PARTIAL },
				});

			await tx
				.update(transactions)
				.set({ isSettled: true })
				.where(
					and(
						eq(transactions.userId, user.id),
						eq(transactions.cardId, card.id),
						eq(transactions.period, data.period),
					),
				);

			const paymentCategory = await tx.query.categories.findFirst({
				columns: { id: true },
				where: and(
					eq(categories.userId, user.id),
					eq(categories.name, "Pagamentos"),
				),
			});

			const invoiceDate = data.paymentDate
				? parseLocalDateString(data.paymentDate)
				: getBusinessTodayDate();

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);
			const paymentPayload = {
				condition: "À vista",
				name: `Pagamento fatura - ${card.name}`,
				paymentMethod: "Pix",
				note: invoiceNote,
				amount: `-${formatDecimalForDbRequired(data.amountPaid)}`,
				purchaseDate: invoiceDate,
				transactionType: "Despesa" as const,
				period: data.period,
				isSettled: true,
				userId: user.id,
				accountId: paymentAccountId,
				categoryId: paymentCategory?.id ?? null,
				payerId: adminPayerId,
			};

			const existingPayment = await tx.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.note, invoiceNote),
				),
			});

			if (existingPayment) {
				await tx
					.update(transactions)
					.set(paymentPayload)
					.where(eq(transactions.id, existingPayment.id));
			} else {
				await tx.insert(transactions).values(paymentPayload);
			}

			// O restante não pago vira um lançamento "Saldo financiado" na
			// fatura do mês seguinte deste cartão — sem juros (decisão do
			// usuário). Reexecutar esta action no mesmo período substitui o
			// pagamento e o saldo financiado anteriores (upsert por nota).
			const remainder =
				Math.round((adminPayableAmount - data.amountPaid) * 100) / 100;
			const carryOverNote = buildCarryOverNote(card.id, data.period);
			const carryOverPayload = {
				condition: "À vista",
				name: CARRY_OVER_TRANSACTION_NAME,
				paymentMethod: "Cartão de crédito",
				note: carryOverNote,
				amount: `-${formatDecimalForDbRequired(remainder)}`,
				purchaseDate: invoiceDate,
				transactionType: "Despesa" as const,
				period: addMonthsToPeriod(data.period, 1),
				isSettled: false,
				userId: user.id,
				cardId: card.id,
				accountId: null,
				categoryId: paymentCategory?.id ?? null,
				payerId: adminPayerId,
			};

			const existingCarryOver = await tx.query.transactions.findFirst({
				columns: { id: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.note, carryOverNote),
				),
			});

			if (existingCarryOver) {
				await tx
					.update(transactions)
					.set(carryOverPayload)
					.where(eq(transactions.id, existingCarryOver.id));
			} else {
				await tx.insert(transactions).values(carryOverPayload);
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Pagamento parcial registrado." };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Erro inesperado.",
		};
	}
}

const installInvoiceSchema = z.object({
	cardId: z.string({ message: "Cartão inválido." }).uuid("Cartão inválido."),
	period: z
		.string({ message: "Período inválido." })
		.regex(PERIOD_FORMAT_REGEX, "Período inválido."),
	installmentCount: z
		.number({ message: "Número de parcelas inválido." })
		.int("Número de parcelas inválido.")
		.min(2, "Mínimo de 2 parcelas.")
		.max(24, "Máximo de 24 parcelas."),
	monthlyRatePercent: z
		.number({ message: "Taxa de juros inválida." })
		.min(0, "A taxa não pode ser negativa."),
});

type InstallInvoiceInput = z.infer<typeof installInvoiceSchema>;

export async function installInvoiceAction(
	input: InstallInvoiceInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = installInvoiceSchema.parse(input);
		const adminPayerId = await getAdminPayerId(user.id);

		if (!adminPayerId) {
			return {
				success: false,
				error: "Nenhum pagador administrador configurado.",
			};
		}

		await db.transaction(async (tx: typeof db) => {
			const card = await tx.query.cards.findFirst({
				columns: { id: true },
				where: and(eq(cards.id, data.cardId), eq(cards.userId, user.id)),
			});

			if (!card) {
				throw new Error("Cartão não encontrado.");
			}

			const adminPayableAmount = await calculateAdminPayableAmount(
				tx,
				user.id,
				card.id,
				data.period,
				adminPayerId,
			);

			const invoiceNote = buildInvoicePaymentNote(card.id, data.period);
			const existingPayment = await tx.query.transactions.findFirst({
				columns: { amount: true },
				where: and(
					eq(transactions.userId, user.id),
					eq(transactions.note, invoiceNote),
				),
			});
			const alreadyPaid = Math.abs(Number(existingPayment?.amount ?? 0));

			const remaining =
				Math.round((adminPayableAmount - alreadyPaid) * 100) / 100;

			if (remaining <= 0) {
				throw new Error("Não há saldo em aberto para parcelar nesta fatura.");
			}

			const schedule = generateAmortizationSchedule({
				principalCents: Math.round(remaining * 100),
				monthlyRatePercent: data.monthlyRatePercent,
				installmentCount: data.installmentCount,
				system: "price",
			});

			if (schedule.length === 0) {
				throw new Error("Não foi possível calcular as parcelas.");
			}

			// O saldo financiado de um pagamento parcial anterior desta
			// mesma fatura é substituído pelo parcelamento (não fica solto
			// e duplicado); parcelamentos anteriores desta fatura também
			// são substituídos, caso o usuário esteja reconfigurando.
			await tx
				.delete(transactions)
				.where(
					and(
						eq(transactions.userId, user.id),
						eq(transactions.note, buildCarryOverNote(card.id, data.period)),
					),
				);

			await tx
				.delete(transactions)
				.where(
					and(
						eq(transactions.userId, user.id),
						like(
							transactions.note,
							`${buildInstallmentInvoiceNotePrefix(card.id, data.period)}%`,
						),
					),
				);

			await tx
				.insert(invoices)
				.values({
					cardId: data.cardId,
					period: data.period,
					paymentStatus: INVOICE_PAYMENT_STATUS.INSTALLED,
					userId: user.id,
				})
				.onConflictDoUpdate({
					target: [invoices.userId, invoices.cardId, invoices.period],
					set: { paymentStatus: INVOICE_PAYMENT_STATUS.INSTALLED },
				});

			await tx
				.update(transactions)
				.set({ isSettled: true })
				.where(
					and(
						eq(transactions.userId, user.id),
						eq(transactions.cardId, card.id),
						eq(transactions.period, data.period),
					),
				);

			const referenceDate = getBusinessTodayDate();

			for (const installment of schedule) {
				await tx.insert(transactions).values({
					condition: "À vista",
					name: buildInstallmentInvoiceName(
						installment.installmentNumber,
						data.installmentCount,
					),
					paymentMethod: "Cartão de crédito",
					note: buildInstallmentInvoiceNote(
						card.id,
						data.period,
						installment.installmentNumber,
					),
					amount: `-${formatDecimalForDbRequired(installment.totalAmountCents / 100)}`,
					purchaseDate: referenceDate,
					transactionType: "Despesa" as const,
					period: addMonthsToPeriod(data.period, installment.installmentNumber),
					isSettled: false,
					userId: user.id,
					cardId: card.id,
					accountId: null,
					categoryId: null,
					payerId: adminPayerId,
					installmentCount: data.installmentCount,
					currentInstallment: installment.installmentNumber,
				});
			}
		});

		revalidateForEntity("cards", user.id);

		return { success: true, message: "Fatura parcelada com sucesso." };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Dados inválidos.",
			};
		}

		return {
			success: false,
			error: error instanceof Error ? error.message : "Erro inesperado.",
		};
	}
}
