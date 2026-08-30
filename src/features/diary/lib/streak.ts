import { parseUtcDateString } from "@/shared/utils/date";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Diferença em dias civis entre duas datas YYYY-MM-DD (business-date
 * strings, sem hora). Seguro contra DST porque ambos os lados são
 * convertidos via UTC-midnight — nenhuma das duas carrega hora local.
 */
function diffInCalendarDays(from: string, to: string): number | null {
	const fromDate = parseUtcDateString(from);
	const toDate = parseUtcDateString(to);
	if (!fromDate || !toDate) {
		return null;
	}
	return Math.round((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
}

export type ComputeStreakOnSaveInput = {
	/** Data de hoje no fuso de negócio do app, via getBusinessDateString(). */
	today: string;
	/** true quando já existia um registro de hoje antes deste save (edição). */
	isEditOfToday: boolean;
	previousLastEntryDate: string | null;
	previousCurrentStreak: number;
	previousLongestStreak: number;
};

export type ComputeStreakOnSaveResult = {
	currentStreak: number;
	longestStreak: number;
	lastEntryDate: string;
};

export function computeStreakOnSave(
	input: ComputeStreakOnSaveInput,
): ComputeStreakOnSaveResult {
	const {
		today,
		isEditOfToday,
		previousLastEntryDate,
		previousCurrentStreak,
		previousLongestStreak,
	} = input;

	if (isEditOfToday) {
		return {
			currentStreak: previousCurrentStreak,
			longestStreak: previousLongestStreak,
			lastEntryDate: today,
		};
	}

	let currentStreak: number;

	if (previousLastEntryDate === null) {
		currentStreak = 1;
	} else {
		const dayDiff = diffInCalendarDays(previousLastEntryDate, today);
		if (dayDiff === 1) {
			currentStreak = previousCurrentStreak + 1;
		} else if (dayDiff !== null && dayDiff > 1) {
			currentStreak = 1;
		} else {
			// dayDiff <= 0 ou nulo: não deveria acontecer (um registro de hoje
			// não existia antes deste save), mas nunca decrementamos por engano.
			console.error("[diary/streak] dayDiff inesperado ao computar streak", {
				previousLastEntryDate,
				today,
				dayDiff,
			});
			currentStreak = 1;
		}
	}

	return {
		currentStreak,
		longestStreak: Math.max(previousLongestStreak, currentStreak),
		lastEntryDate: today,
	};
}

export type StreakRow = {
	currentStreak: number;
	longestStreak: number;
	lastEntryDate: string | null;
};

export type ResolveDisplayStreakResult = {
	currentStreak: number;
	longestStreak: number;
	hasCheckedInToday: boolean;
	isBrokenSinceLastEntry: boolean;
};

/**
 * Correção de exibição em tempo de leitura: não há cron/job neste app, então
 * uma streak "quebrada" (usuário pulou um dia inteiro) só é corrigida no
 * banco no próximo save. Para exibição, recalculamos a cada leitura.
 */
export function resolveDisplayStreak(
	row: StreakRow,
	today: string,
): ResolveDisplayStreakResult {
	const { currentStreak, longestStreak, lastEntryDate } = row;

	if (lastEntryDate === today) {
		return {
			currentStreak,
			longestStreak,
			hasCheckedInToday: true,
			isBrokenSinceLastEntry: false,
		};
	}

	if (lastEntryDate !== null) {
		const dayDiff = diffInCalendarDays(lastEntryDate, today);
		if (dayDiff === 1) {
			// Ainda dentro do prazo de hoje para manter a streak viva.
			return {
				currentStreak,
				longestStreak,
				hasCheckedInToday: false,
				isBrokenSinceLastEntry: false,
			};
		}
	}

	return {
		currentStreak: 0,
		longestStreak,
		hasCheckedInToday: false,
		isBrokenSinceLastEntry: true,
	};
}
