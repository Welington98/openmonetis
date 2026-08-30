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

export const diarySettingsInputSchema = z.object({
	reminderEnabled: z.boolean({ message: "Informe se o lembrete está ativo." }),
	reminderTime: z
		.string({ message: "Informe o horário do lembrete." })
		.regex(DIARY_REMINDER_TIME_REGEX, "Horário inválido. Use o formato HH:mm."),
});

export type DiarySettingsInput = z.infer<typeof diarySettingsInputSchema>;
