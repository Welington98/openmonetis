export type DailyBudgetCalculationMode = "automatico" | "personalizado";

export type CalculateDailyBudgetInput = {
	/** Do calculateAvailableBalance — pode ser negativo. */
	availableBalance: number;
	daysRemaining: number;
	calculationMode: DailyBudgetCalculationMode;
	customDailyLimit: number | null;
	/**
	 * Gasto VARIÁVEL/discricionário de hoje — não inclui despesas de centro
	 * de custo "fixa" (essas já saíram do `availableBalance` no dia 1º do
	 * mês, então pagar uma conta fixa hoje não deve "estourar" o dia).
	 */
	spentToday: number;
};

export type DailyBudgetResult = {
	/** Nunca negativo — R$0 no caso de déficit. */
	dailyBudgetAmount: number;
	/** dailyBudgetAmount - spentToday — pode ser negativo. */
	remainingToday: number;
	/** availableBalance < 0, independente do modo. */
	isDeficit: boolean;
	/** Só relevante em modo personalizado: gastar o limite fixo todos os dias restantes ultrapassaria o disponível antes da próxima entrada. */
	personalizedLimitRisksNegativeBalance: boolean;
};

/**
 * Modo automático: orcamento_diario = max(dinheiro_livre, 0) / dias_restantes.
 *
 * Modo personalizado: usa customDailyLimit diretamente como orçamento do
 * dia, ignorando a divisão — mas ainda expõe isDeficit/alerta quando esse
 * valor fixo, multiplicado pelos dias restantes, ultrapassaria o saldo
 * disponível antes da próxima entrada.
 *
 * A realocação dinâmica ("gastar menos hoje aumenta o de amanhã") é
 * implícita: não há estado guardado de "orçamento de hoje" — cada chamada
 * recebe availableBalance/daysRemaining já atualizados pelo caller
 * (queries.ts), refletindo o saldo real e um dia a menos.
 */
export function calculateDailyBudget({
	availableBalance,
	daysRemaining,
	calculationMode,
	customDailyLimit,
	spentToday,
}: CalculateDailyBudgetInput): DailyBudgetResult {
	const isDeficit = availableBalance < 0;
	const safeDaysRemaining = Math.max(daysRemaining, 1);

	const dailyBudgetAmount =
		calculationMode === "personalizado"
			? Math.max(customDailyLimit ?? 0, 0)
			: availableBalance > 0
				? availableBalance / safeDaysRemaining
				: 0;

	const personalizedLimitRisksNegativeBalance =
		calculationMode === "personalizado" &&
		(customDailyLimit ?? 0) * safeDaysRemaining > availableBalance;

	return {
		dailyBudgetAmount,
		remainingToday: dailyBudgetAmount - spentToday,
		isDeficit,
		personalizedLimitRisksNegativeBalance,
	};
}
