import { parseUtcDateString, toDateOnlyString } from "@/shared/utils/date";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Toda a matemática de semana do Diário mora aqui — semana = segunda a
 * domingo, sempre em cima de strings "YYYY-MM-DD" via UTC (mesmo padrão de
 * streak.ts/calendar-status.ts). Antes disso havia duas implementações
 * inconsistentes (uma em hora local em queries.ts, outra em UTC só para o
 * fingerprint do resumo semanal) — consolidadas aqui.
 */

export function addDays(dateString: string, days: number): string {
	const date = parseUtcDateString(dateString);
	if (!date) {
		return dateString;
	}
	date.setUTCDate(date.getUTCDate() + days);
	return toDateOnlyString(date) ?? dateString;
}

export function addWeeks(dateString: string, weeks: number): string {
	return addDays(dateString, weeks * 7);
}

/** Segunda-feira da semana que contém `dateString`. */
export function getWeekStart(dateString: string): string {
	const date = parseUtcDateString(dateString);
	if (!date) {
		return dateString;
	}
	const dayNum = date.getUTCDay() || 7; // 1 (seg) .. 7 (dom)
	date.setUTCDate(date.getUTCDate() - (dayNum - 1));
	return toDateOnlyString(date) ?? dateString;
}

/** Os 7 dias (segunda -> domingo) a partir de `weekStart`. */
export function getWeekDays(weekStart: string): string[] {
	return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Rótulo de semana ISO 8601 (ex: "2026-W35"), usado como fingerprint de dismiss. */
export function getIsoWeekLabel(dateString: string): string {
	const date = parseUtcDateString(dateString);
	if (!date) {
		return dateString;
	}

	const dayNum = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - dayNum);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const weekNo = Math.ceil(
		((date.getTime() - yearStart.getTime()) / MS_PER_DAY + 1) / 7,
	);

	return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
