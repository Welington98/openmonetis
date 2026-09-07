export type DailyAllowanceInput = {
	calculationMode: "automatico" | "personalizado";
	customDailyLimit: number | null;
	/** Soma dos orçamentos criados (feature Orçamentos) pro mês corrente. */
	monthlyBudgetTotal: number;
	/** Despesa "fixa" já conhecida do mês corrente inteiro (passado + futuro), magnitude positiva. */
	fixedThisMonth: number;
	/**
	 * Despesa "variavel" (ou sem centro de custo) já conhecida do mês
	 * corrente inteiro (passado + futuro), magnitude positiva — o que já
	 * está lançado consome a cota tanto quanto o que ainda vai ser gasto,
	 * senão um mês já estourado mostraria uma cota positiva pros dias vazios
	 * que sobraram, contradizendo o aviso de "orçamento estourado" que
	 * `/daily-budget` já mostra pro mesmo mês.
	 */
	variableKnownThisMonth: number;
	daysInMonth: number;
};

/**
 * Cota diária pra preencher dias futuros sem despesa variável já
 * materializada (ver `generateBalanceProjection`). Deliberadamente mais
 * simples que `calculateDailyBudget` de `daily-budget` (não reage ao saldo
 * real disponível minuto a minuto) mas precisa concordar com o MESMO sinal
 * de estouro: nunca positiva quando o que já foi gasto/lançado no mês já
 * ultrapassa o orçamento.
 */
export function calculateBalanceDailyAllowance({
	calculationMode,
	customDailyLimit,
	monthlyBudgetTotal,
	fixedThisMonth,
	variableKnownThisMonth,
	daysInMonth,
}: DailyAllowanceInput): number {
	if (calculationMode === "personalizado") {
		return Math.max(customDailyLimit ?? 0, 0);
	}

	if (monthlyBudgetTotal <= 0 || daysInMonth <= 0) {
		return 0;
	}

	const remainingVariableBudget = Math.max(
		monthlyBudgetTotal - fixedThisMonth - variableKnownThisMonth,
		0,
	);

	return remainingVariableBudget / daysInMonth;
}
