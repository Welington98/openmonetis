export type DailyForecastItemInput = {
	name: string;
	amount: number;
};

export type DailyForecastResult = {
	/** Soma dos gastos mensais previstos. */
	monthlyTotal: number;
	/** Dias usados na divisão (mínimo 1). */
	days: number;
	/** monthlyTotal ÷ days, arredondado pra baixo em centavos. */
	dailyAmount: number;
};

/**
 * Previsão de diário (método do Breno): soma os gastos variáveis esperados
 * no mês e divide pelos dias do mês. Arredonda pra baixo em centavos pra o
 * limite diário nunca somar mais que o previsto.
 */
export function calculateDailyForecast(
	items: ReadonlyArray<Pick<DailyForecastItemInput, "amount">>,
	days: number,
): DailyForecastResult {
	const safeDays = Math.max(Math.floor(days), 1);
	const monthlyTotalCents = items.reduce(
		(sum, item) => sum + Math.round(Math.max(item.amount, 0) * 100),
		0,
	);

	return {
		monthlyTotal: monthlyTotalCents / 100,
		days: safeDays,
		dailyAmount: Math.floor(monthlyTotalCents / safeDays) / 100,
	};
}
