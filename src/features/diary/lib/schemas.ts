import { z } from "zod";
import {
	DIARY_CATEGORIES,
	DIARY_CLASSIFICATIONS,
	DIARY_REMINDER_TIME_REGEX,
} from "@/features/diary/lib/constants";
import { noteSchema, requiredDecimalSchema } from "@/shared/lib/schemas/common";

const categoryValues = DIARY_CATEGORIES.map((item) => item.value) as [
	string,
	...string[],
];
const classificationValues = DIARY_CLASSIFICATIONS.map(
	(item) => item.value,
) as [string, ...string[]];

/**
 * Nunca aceita uma data vinda do cliente — o dia do check-in é sempre
 * `getBusinessDateString()` calculado no servidor, o que garante
 * estruturalmente que só o dia de hoje pode ser criado/editado.
 */
export const diaryEntryInputSchema = z
	.object({
		hadExpense: z.boolean({ message: "Informe se houve gasto hoje." }),
		amount: requiredDecimalSchema("valor gasto").optional(),
		category: z.enum(categoryValues).nullish(),
		classification: z.enum(classificationValues).nullish(),
		note: noteSchema,
	})
	.refine((data) => !data.hadExpense || data.amount !== undefined, {
		message: "Informe o valor gasto.",
		path: ["amount"],
	});

export type DiaryEntryInput = z.input<typeof diaryEntryInputSchema>;

/**
 * Aceita string vazia/null/undefined como "sem limite" (transforma em null);
 * quando preenchido, exige um número maior que zero. Diferente de
 * `requiredDecimalSchema`, aqui a ausência de valor é um estado válido.
 */
const optionalDailyBudgetSchema = z
	.union([z.literal(""), z.string(), z.number(), z.null(), z.undefined()])
	.transform((value, ctx) => {
		if (value === "" || value === null || value === undefined) {
			return null;
		}

		const parsed =
			typeof value === "number"
				? value
				: Number.parseFloat(value.replace(",", "."));

		if (Number.isNaN(parsed)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Informe um valor numérico válido.",
			});
			return z.NEVER;
		}

		if (parsed <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Informe um orçamento diário maior que zero, ou deixe em branco para desativar.",
			});
			return z.NEVER;
		}

		return parsed;
	});

export const diarySettingsInputSchema = z.object({
	reminderEnabled: z.boolean({ message: "Informe se o lembrete está ativo." }),
	reminderTime: z
		.string({ message: "Informe o horário do lembrete." })
		.regex(DIARY_REMINDER_TIME_REGEX, "Horário inválido. Use o formato HH:mm."),
	dailyBudgetAmount: optionalDailyBudgetSchema,
});

export type DiarySettingsInput = z.input<typeof diarySettingsInputSchema>;
