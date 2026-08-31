import { z } from "zod";

/**
 * Campo decimal opcional: string vazia/null/undefined vira null ("não
 * configurado"); preenchido, exige número > 0. Mesmo padrão do orçamento
 * diário manual do diário (diary/lib/schemas.ts), mas reutilizável pros 3
 * campos monetários opcionais das configurações do Orçamento Diário Dinâmico.
 */
function optionalPositiveDecimalSchema(fieldName: string) {
	return z
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
					message: `Informe um valor numérico válido para ${fieldName}.`,
				});
				return z.NEVER;
			}

			if (parsed <= 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: `${fieldName} deve ser maior que zero, ou deixe em branco.`,
				});
				return z.NEVER;
			}

			return parsed;
		});
}

export const dailyBudgetSettingsInputSchema = z.object({
	calculationMode: z.enum(["automatico", "personalizado"], {
		message: "Selecione um modo de cálculo válido.",
	}),
	customDailyLimit: optionalPositiveDecimalSchema("o limite diário"),
	targetSavings: optionalPositiveDecimalSchema("a meta de economia"),
	safetyBuffer: optionalPositiveDecimalSchema("a reserva de segurança"),
});

export type DailyBudgetSettingsInput = z.input<
	typeof dailyBudgetSettingsInputSchema
>;
