export type CalculateAvailableBalanceInput = {
	/** Soma dos orçamentos criados (feature Orçamentos) pro mês. */
	monthlyBudgetTotal: number;
	/** Magnitude positiva de Despesa já lançada no mês, purchaseDate <= hoje. */
	spentThisMonth: number;
	/** Magnitude positiva de Despesa já lançada no mês, purchaseDate > hoje. */
	futureKnownExpenses: number;
	/** Meta de economia do mês (settings.targetSavings ?? 0). */
	targetSavings: number;
	/** Reserva de segurança do mês (settings.safetyBuffer ?? 0). */
	safetyBuffer: number;
};

export type AvailableBalanceResult = {
	/**
	 * Quanto ainda resta do orçamento mensal planejado, já descontando o que
	 * foi gasto, o que já está comprometido pra frente e as reservas — pode
	 * ser negativo (orçamento estourado).
	 */
	availableBalance: number;
};

/**
 * disponível = orçamento_mensal - gasto_realizado_no_mes -
 * despesas_futuras_conhecidas - meta_economia - reserva_seguranca.
 */
export function calculateAvailableBalance({
	monthlyBudgetTotal,
	spentThisMonth,
	futureKnownExpenses,
	targetSavings,
	safetyBuffer,
}: CalculateAvailableBalanceInput): AvailableBalanceResult {
	return {
		availableBalance:
			monthlyBudgetTotal -
			spentThisMonth -
			futureKnownExpenses -
			targetSavings -
			safetyBuffer,
	};
}
