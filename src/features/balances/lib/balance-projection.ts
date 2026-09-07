import { addDays, compareDateOnly } from "@/shared/utils/date";

/**
 * 1 entrada por dia com movimentação real/já materializada conhecida no
 * intervalo. Dias sem entrada = nenhuma movimentação conhecida naquele dia.
 * Magnitudes sempre positivas — o sinal é aplicado na fórmula da projeção.
 */
export type BalanceDayMovement = {
	/** "YYYY-MM-DD" */
	date: string;
	/** Receita do dia. */
	income: number;
	/** Despesa não-cartão de centro de custo "fixa" (ou sem centro de custo) — sempre pela data real, nunca substituída pela cota diária. */
	fixedExpenses: number;
	/** Despesa não-cartão de centro de custo "variavel" já materializada no dia — usada pra decidir se a cota diária entra ou não nesse dia. */
	variableExpenses: number;
	/** Despesa não-cartão de centro de custo "economia". */
	savings: number;
	/** Fatura de cartão não paga vencendo nesse dia (soma de todos os cartões, só a cota do pagador admin). */
	cardDue: number;
};

export type BalanceProjectionInput = {
	/** "YYYY-MM-DD" — primeiro dia da janela. */
	windowStart: string;
	/** "YYYY-MM-DD" — último dia da janela. */
	windowEnd: string;
	/** "YYYY-MM-DD", hoje. */
	today: string;
	/** `fetchDashboardAccounts().totalBalance` — soma de todo lançamento REALIZADO, qualquer data, passada ou futura. Não é "o saldo de hoje". */
	anchorBalance: number;
	/**
	 * Fluxo líquido diário (sinal já aplicado) de lançamentos REALIZADOS que
	 * entram em `anchorBalance` — qualquer data, dentro ou fora da janela.
	 * Usado só pra desfazer/refazer `anchorBalance` e chegar no saldo real de
	 * `windowStart`. Ver `fetchSettledNetByDate`.
	 */
	settledNetByDate: Map<string, number>;
	/** Movimentações conhecidas dentro da janela — ver `BalanceDayMovement`. */
	movements: BalanceDayMovement[];
	/**
	 * Cota diária de gasto variável pra dias futuros sem despesa variável já
	 * materializada nesse dia — evita contar duas vezes uma recorrência já
	 * conhecida (ex: assinatura) e ao mesmo tempo cobre dias sem nenhum
	 * lançamento futuro registrado ainda.
	 */
	dailyAllowance: number;
};

export type BalanceProjectionRow = {
	date: string;
	income: number;
	/** Coluna "saídas" — despesa fixa/não classificada, real. */
	expenses: number;
	/** Coluna "diários" — gasto variável real (d <= hoje) ou cota diária estimada (d > hoje, só quando não há gasto variável real nesse dia). */
	daily: number;
	savings: number;
	/** Coluna "cartão" — fatura não paga vencendo nesse dia. */
	card: number;
	/** Saldo acumulado ao final do dia. */
	balance: number;
	isFuture: boolean;
	isToday: boolean;
};

export type BalanceProjectionResult = {
	/** Saldo real no início da janela (`windowStart`, antes do primeiro dia). */
	startingBalance: number;
	rows: BalanceProjectionRow[];
};

/**
 * Gera o saldo acumulado dia a dia de uma janela, ancorado no saldo
 * consolidado real (`anchorBalance`) — não parte de zero e não reseta no
 * virar do mês (ao contrário de `daily-budget/lib/daily-projection.ts`,
 * que é uma contagem regressiva de orçamento e reseta a cada mês por
 * decisão de produto — não "consertar" um puxando o comportamento do outro).
 *
 * Ancoragem: `anchorBalance` soma todo lançamento realizado, qualquer data
 * (passada OU futura), sem filtro de janela. Pra achar o saldo real no
 * início da janela, desfaz (passada pra trás) todo lançamento realizado
 * datado a partir de `windowStart` — inclusive o que cai depois de
 * `windowEnd`, que nunca é refeito porque a passada pra frente não alcança
 * essa data. Isso funciona sem caso especial pra janela no passado, no
 * futuro, ou que contém hoje.
 */
export function generateBalanceProjection({
	windowStart,
	windowEnd,
	today,
	anchorBalance,
	settledNetByDate,
	movements,
	dailyAllowance,
}: BalanceProjectionInput): BalanceProjectionResult {
	let settledFromWindowStart = 0;
	for (const [date, net] of settledNetByDate) {
		if (compareDateOnly(date, windowStart) >= 0) {
			settledFromWindowStart += net;
		}
	}
	const startingBalance = anchorBalance - settledFromWindowStart;

	const movementsByDate = new Map(
		movements.map((entry) => [entry.date, entry]),
	);

	const rows: BalanceProjectionRow[] = [];
	let balance = startingBalance;

	for (
		let date = windowStart;
		compareDateOnly(date, windowEnd) <= 0;
		date = addDays(date, 1)
	) {
		const known = movementsByDate.get(date);
		const isFuture = compareDateOnly(date, today) > 0;
		const isToday = date === today;

		const income = known?.income ?? 0;
		const expenses = known?.fixedExpenses ?? 0;
		const variableReal = known?.variableExpenses ?? 0;
		const daily = isFuture
			? variableReal > 0
				? variableReal
				: dailyAllowance
			: variableReal;
		const savings = known?.savings ?? 0;
		const card = known?.cardDue ?? 0;

		balance = balance + income - expenses - daily - savings - card;

		rows.push({
			date,
			income,
			expenses,
			daily,
			savings,
			card,
			balance,
			isFuture,
			isToday,
		});
	}

	return { startingBalance, rows };
}
