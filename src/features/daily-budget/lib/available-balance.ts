export type CalculateAvailableBalanceInput = {
	/** Soma dos orçamentos criados (feature Orçamentos) pro mês. */
	monthlyBudgetTotal: number;
	/**
	 * Magnitude positiva de Despesa de categorias com centro de custo "fixa",
	 * somada pro período INTEIRO (passado + futuro) — pré-alocada do saldo
	 * desde o dia 1º, então pagar a conta em qualquer dia do mês não muda a
	 * cota diária.
	 */
	totalFixedThisMonth: number;
	/** Magnitude positiva de Despesa "variavel" já lançada, purchaseDate <= hoje. */
	variableSpentSoFar: number;
	/** Magnitude positiva de Despesa "variavel" já lançada, purchaseDate > hoje. */
	variableFutureKnown: number;
	/** Meta de economia do mês (settings.targetSavings ?? 0). */
	targetSavings: number;
	/** Reserva de segurança do mês (settings.safetyBuffer ?? 0). */
	safetyBuffer: number;
};

export type AvailableBalanceResult = {
	/**
	 * Quanto ainda resta do orçamento mensal planejado, já descontando as
	 * despesas fixas do mês inteiro, o gasto variável (realizado e já
	 * conhecido pra frente) e as reservas — pode ser negativo (orçamento
	 * estourado).
	 */
	availableBalance: number;
};

/**
 * disponível = orçamento_mensal - despesas_fixas_do_mes_inteiro -
 * gasto_variavel_realizado - gasto_variavel_futuro_conhecido -
 * meta_economia - reserva_seguranca.
 */
export function calculateAvailableBalance({
	monthlyBudgetTotal,
	totalFixedThisMonth,
	variableSpentSoFar,
	variableFutureKnown,
	targetSavings,
	safetyBuffer,
}: CalculateAvailableBalanceInput): AvailableBalanceResult {
	return {
		availableBalance:
			monthlyBudgetTotal -
			totalFixedThisMonth -
			variableSpentSoFar -
			variableFutureKnown -
			targetSavings -
			safetyBuffer,
	};
}
