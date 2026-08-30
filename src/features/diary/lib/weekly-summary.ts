export { getIsoWeekLabel } from "@/features/diary/lib/week";

export type ComputeWeeklySummaryInput = {
	daysLoggedThisWeek: number;
	totalSpentThisWeek: number;
	totalSpentLastWeek: number;
};

export type WeeklySummaryResult = {
	daysLogged: number;
	totalSpent: number;
	/** Variação percentual vs. semana anterior; null quando não há base de comparação. */
	comparisonPct: number | null;
	message: string;
};

function buildMessage(daysLogged: number): string {
	if (daysLogged >= 7) return "Semana perfeita! Todos os dias registrados.";
	if (daysLogged >= 5) return "Ótima consistência essa semana!";
	if (daysLogged >= 3) return "Bom começo — tente registrar mais dias.";
	if (daysLogged >= 1) return "Todo registro conta. Vamos manter o ritmo?";
	return "Nenhum check-in essa semana. Que tal começar hoje?";
}

export function computeWeeklySummary(
	input: ComputeWeeklySummaryInput,
): WeeklySummaryResult {
	const { daysLoggedThisWeek, totalSpentThisWeek, totalSpentLastWeek } = input;

	const comparisonPct =
		totalSpentLastWeek > 0
			? ((totalSpentThisWeek - totalSpentLastWeek) / totalSpentLastWeek) * 100
			: null;

	return {
		daysLogged: daysLoggedThisWeek,
		totalSpent: totalSpentThisWeek,
		comparisonPct,
		message: buildMessage(daysLoggedThisWeek),
	};
}
