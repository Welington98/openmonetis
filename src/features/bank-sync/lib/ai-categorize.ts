import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_MODEL } from "@/features/insights/constants";
import { resolveInsightsModel } from "@/features/insights/lib/model-provider";

const suggestionSchema = z.object({
	categoryId: z.string().nullable(),
});

/**
 * Sugere uma categoria pra uma transação sincronizada, usando o mesmo
 * provedor de IA já configurado para os Insights. Nunca aplica sozinha — só
 * retorna uma sugestão pra pré-preencher o formulário, que o usuário confirma
 * ou troca antes de criar o lançamento. Falha silenciosa (retorna null) se a
 * IA não estiver configurada ou a chamada falhar — categorização por IA é
 * sempre best-effort, nunca bloqueia o fluxo.
 */
export async function suggestCategoryForStatementLine(input: {
	description: string;
	amount: number;
	type: "despesa" | "receita";
	categories: { id: string; name: string }[];
}): Promise<string | null> {
	if (input.categories.length === 0) return null;

	const resolvedModel = resolveInsightsModel(DEFAULT_MODEL);
	if (!resolvedModel.success) return null;

	try {
		const result = await generateObject({
			model: resolvedModel.model,
			schema: suggestionSchema,
			system:
				"Você classifica transações de um extrato bancário brasileiro na categoria mais provável, escolhendo entre uma lista fixa de categorias já cadastradas pelo usuário. Nunca invente uma categoria fora da lista.",
			prompt: `Transação: "${input.description}", valor R$ ${input.amount.toFixed(2)}, tipo: ${input.type}.

Categorias disponíveis (id: nome):
${input.categories.map((c) => `${c.id}: ${c.name}`).join("\n")}

Responda com o "categoryId" de uma das categorias acima que melhor se encaixa, ou null se nenhuma servir bem.`,
		});

		const parsed = suggestionSchema.parse(result.object);
		if (!parsed.categoryId) return null;

		const isValid = input.categories.some((c) => c.id === parsed.categoryId);
		return isValid ? parsed.categoryId : null;
	} catch (error) {
		console.error(
			"[bank-sync] Falha ao sugerir categoria via IA:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}
