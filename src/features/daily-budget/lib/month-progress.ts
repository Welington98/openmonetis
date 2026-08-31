export type CalculateMonthProgressInput = {
	/** "YYYY-MM-DD", hoje (fuso de negócio) — resolvido pelo caller. */
	today: string;
};

export type MonthProgress = {
	/** "YYYY-MM" do mês corrente. */
	period: string;
	daysInMonth: number;
	/** Inclui hoje. */
	daysElapsed: number;
	/** Inclui hoje. Mínimo 1. */
	daysRemaining: number;
};

/**
 * Progresso do mês calendário corrente — base do orçamento diário
 * automático (orçamento mensal ÷ dias restantes do mês). Substitui o
 * conceito anterior de "ciclo até a próxima entrada de renda": o usuário
 * decidiu que o divisor deve ser sempre o mês calendário, não um ciclo
 * variável.
 */
export function calculateMonthProgress({
	today,
}: CalculateMonthProgressInput): MonthProgress {
	const period = today.slice(0, 7);
	const [yearPart, monthPart] = period.split("-");
	const year = Number.parseInt(yearPart ?? "", 10);
	const month = Number.parseInt(monthPart ?? "", 10);
	const dayOfMonth = Number.parseInt(today.slice(8, 10), 10);

	const daysInMonth = new Date(year, month, 0).getDate();
	const daysElapsed = Math.min(Math.max(dayOfMonth, 1), daysInMonth);
	const daysRemaining = Math.max(daysInMonth - daysElapsed + 1, 1);

	return { period, daysInMonth, daysElapsed, daysRemaining };
}
