import type { DiaryCategory } from "@/features/diary/lib/constants";

const DIARY_CATEGORY_LABELS: Record<Exclude<DiaryCategory, "outro">, string> = {
	alimentacao: "Alimentação",
	transporte: "Transporte",
	lazer: "Lazer",
	contas: "Contas",
};

/**
 * Mapeia a categoria fixa do diário pro nome de uma categoria real (feature
 * Categorias), pra tentar um lookup por nome ao criar o lançamento do
 * check-in. "outro"/null/valor desconhecido nunca tenta mapear — fica pro
 * fallback genérico. Aceita `string` (não só `DiaryCategory`) porque o
 * schema de validação do check-in (diary/lib/schemas.ts) não preserva o
 * union literal na saída do zod.
 */
export function mapDiaryCategoryToLabel(
	category: string | null | undefined,
): string | null {
	if (!category || category === "outro") return null;
	return (
		DIARY_CATEGORY_LABELS[category as Exclude<DiaryCategory, "outro">] ?? null
	);
}
