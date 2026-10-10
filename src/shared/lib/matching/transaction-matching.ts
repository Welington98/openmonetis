/**
 * Heurística pura de matching entre uma linha de extrato (Pluggy ou arquivo
 * importado) e lançamentos já existentes no app — evita duplicar quando o
 * usuário já tinha lançado manualmente algo que o banco também reportou.
 * Sem I/O: recebe os candidatos já carregados do banco e devolve o melhor.
 */

const MAX_DATE_DISTANCE_DAYS = 3;

export type MatchableTransaction = {
	id: string;
	name: string;
	amount: number;
	purchaseDate: Date;
	/** "Receita" | "Despesa" — quando informado nos dois lados, precisa bater. */
	transactionType?: string | null;
	installmentCount?: number | null;
	currentInstallment?: number | null;
};

export type StatementLineForMatching = {
	description: string;
	amount: number;
	date: Date;
	transactionType?: "Receita" | "Despesa" | null;
	/** Parcela detectada na linha (ex.: "2/4"). */
	installment?: { current: number; total: number } | null;
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

const toCents = (value: number) => Math.round(Math.abs(value) * 100);

/**
 * Parcelas de uma mesma compra repetem valor e data de compra. Quando a linha
 * é a parcela N/T, só casa com a parcela N/T do lançamento existente (se ele
 * for parcelado); quando o existente é parcelado e a linha não, não casa.
 */
function isInstallmentCompatible(
	line: StatementLineForMatching,
	candidate: MatchableTransaction,
): boolean {
	const candidateIsInstallment = Boolean(candidate.installmentCount);
	if (!line.installment) return !candidateIsInstallment;
	if (!candidateIsInstallment) return true;
	return (
		candidate.installmentCount === line.installment.total &&
		candidate.currentInstallment === line.installment.current
	);
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
	const lineCents = toCents(line.amount);

	return candidates
		.filter((candidate) => toCents(candidate.amount) === lineCents)
		.filter(
			(candidate) =>
				!line.transactionType ||
				!candidate.transactionType ||
				candidate.transactionType === line.transactionType,
		)
		.filter((candidate) => isInstallmentCompatible(line, candidate))
		.map((candidate) => {
			const dateDistance = dateDistanceInDays(
				candidate.purchaseDate,
				line.date,
			);
			// Parcelas seguintes mantêm a data da compra original: a janela de
			// data só vale pra lançamentos à vista.
			const ignoreDate = Boolean(
				line.installment && candidate.installmentCount,
			);
			if (!ignoreDate && dateDistance > MAX_DATE_DISTANCE_DAYS) return null;

			const similarity = descriptionSimilarity(
				candidate.name,
				line.description,
			);
			// Peso maior para proximidade de data, similaridade de texto desempata.
			const score = ignoreDate
				? similarity
				: (1 - dateDistance / MAX_DATE_DISTANCE_DAYS) * 0.7 + similarity * 0.3;

			return { transactionId: candidate.id, score };
		})
		.filter((candidate): candidate is MatchCandidate => candidate !== null)
		.sort((a, b) => b.score - a.score);
}

/** Acima desse score, o match é considerado forte o suficiente para sugerir automaticamente. */
export const AUTO_SUGGEST_THRESHOLD = 0.6;

/**
 * Casamento 1:1 de várias linhas contra os mesmos candidatos: um lançamento
 * existente só é atribuído a uma linha (a de maior score), pra duas compras
 * iguais no lote não apontarem pro mesmo lançamento. Retorna, por índice da
 * linha, o melhor candidato acima do limiar (ou null).
 */
export function matchLinesToTransactions(
	lines: StatementLineForMatching[],
	candidates: MatchableTransaction[],
): (MatchCandidate | null)[] {
	const pairs = lines.flatMap((line, lineIndex) =>
		findMatchCandidates(line, candidates)
			.filter((match) => match.score >= AUTO_SUGGEST_THRESHOLD)
			.map((match) => ({ lineIndex, ...match })),
	);
	pairs.sort((a, b) => b.score - a.score);

	const result: (MatchCandidate | null)[] = lines.map(() => null);
	const usedTransactions = new Set<string>();

	for (const pair of pairs) {
		if (result[pair.lineIndex] || usedTransactions.has(pair.transactionId)) {
			continue;
		}
		result[pair.lineIndex] = {
			transactionId: pair.transactionId,
			score: pair.score,
		};
		usedTransactions.add(pair.transactionId);
	}

	return result;
}
