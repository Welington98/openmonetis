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

/** Rótulo de semana ISO 8601 (ex: "2026-W35"), usado como fingerprint de dismiss. */
export function getIsoWeekLabel(dateString: string): string {
	const [yearStr, monthStr, dayStr] = dateString.split("-");
	const year = Number.parseInt(yearStr ?? "", 10);
	const month = Number.parseInt(monthStr ?? "", 10);
	const day = Number.parseInt(dayStr ?? "", 10);

	const date = new Date(Date.UTC(year, month - 1, day));
	const dayNum = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const weekNo = Math.ceil(
		((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
	);

	return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
