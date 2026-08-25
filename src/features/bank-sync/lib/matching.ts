/**
 * Heurística pura de matching entre uma linha de extrato (sincronizada via
 * Pluggy) e lançamentos já existentes no app — evita duplicar quando o
 * usuário já tinha lançado manualmente algo que o banco também reportou.
 * Sem I/O: recebe os candidatos já carregados do banco e devolve o melhor.
 */

const MAX_DATE_DISTANCE_DAYS = 3;

export type MatchableTransaction = {
	id: string;
	name: string;
	amount: number;
	purchaseDate: Date;
};

export type StatementLineForMatching = {
	description: string;
	amount: number;
	date: Date;
};

export type MatchCandidate = {
	transactionId: string;
	score: number;
};

function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // remove marcas de acento após NFD
		.replace(/[^a-z0-9 ]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function descriptionSimilarity(a: string, b: string): number {
	const normA = normalize(a);
	const normB = normalize(b);
	if (!normA || !normB) return 0;
	if (normA === normB) return 1;

	const wordsA = new Set(normA.split(" "));
	const wordsB = new Set(normB.split(" "));
	const intersection = [...wordsA].filter((word) => wordsB.has(word));
	const union = new Set([...wordsA, ...wordsB]);
	return union.size === 0 ? 0 : intersection.length / union.size;
}

function dateDistanceInDays(a: Date, b: Date): number {
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.abs(a.getTime() - b.getTime()) / msPerDay;
}

/**
 * Retorna candidatos ordenados por score (maior primeiro). Só considera
 * candidatos com valor exatamente igual (em módulo) e data dentro da janela.
 * A similaridade de descrição desempata entre candidatos de mesmo valor/data.
 */
export function findMatchCandidates(
	line: StatementLineForMatching,
	candidates: MatchableTransaction[],
): MatchCandidate[] {
	const lineAmount = Math.abs(line.amount);

	return candidates
		.filter((candidate) => Math.abs(candidate.amount) === lineAmount)
		.map((candidate) => {
			const dateDistance = dateDistanceInDays(
				candidate.purchaseDate,
				line.date,
			);
			if (dateDistance > MAX_DATE_DISTANCE_DAYS) return null;

			const similarity = descriptionSimilarity(
				candidate.name,
				line.description,
			);
			// Peso maior para proximidade de data, similaridade de texto desempata.
			const score =
				(1 - dateDistance / MAX_DATE_DISTANCE_DAYS) * 0.7 + similarity * 0.3;

			return { transactionId: candidate.id, score };
		})
		.filter((candidate): candidate is MatchCandidate => candidate !== null)
		.sort((a, b) => b.score - a.score);
}

/** Acima desse score, o match é considerado forte o suficiente para sugerir automaticamente. */
export const AUTO_SUGGEST_THRESHOLD = 0.6;
