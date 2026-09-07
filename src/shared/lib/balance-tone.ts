export type BalanceTone = "success" | "warning" | "attention" | "danger";

/**
 * Verde/amarelo/rosa/vermelho, em 4 faixas em torno de zero e de
 * `warningThreshold` (ex: reserva de segurança, cota diária × 7, ou
 * orçamento diário × 7 — cada chamador escolhe o que faz sentido pra sua
 * escala):
 * - `success` (verde): confortável, acima do limiar de atenção.
 * - `warning` (amarelo): positivo, mas já abaixo do limiar — atenção.
 * - `attention` (rosa): negativo, mas ainda dentro de uma margem — dá pra
 *   recuperar sem alarde.
 * - `danger` (vermelho): negativo além da margem — estouro sério.
 *
 * Usado tanto pelo saldo de caixa projetado (`features/balances`) quanto
 * pelo orçamento restante do mês (`features/daily-budget`) — mesma
 * semântica de "quanto sobrou", só a escala do limiar muda por chamador.
 * Cor nunca é o único sinal — o valor numérico já traz o sinal.
 */
export function getBalanceTone(
	balance: number,
	warningThreshold: number,
): BalanceTone {
	if (balance < -warningThreshold) return "danger";
	if (balance < 0) return "attention";
	if (balance < warningThreshold) return "warning";
	return "success";
}

/**
 * Fundo em tom pastel (opacidade fixa, igual pra qualquer valor da mesma
 * faixa) — mais discreto e alinhado ao resto do design do app do que um
 * preenchimento sólido/vibrante. Não escala com o valor: a faixa é que
 * decide a cor, não o quão extremo o número é.
 */
const TONE_BG_TOKEN: Record<BalanceTone, string> = {
	success: "bg-success/15",
	warning: "bg-warning/15",
	// Rosa reaproveita o token de gráfico `chart-5` (pink-500) — não é uma
	// cor semântica própria do design system, mas é o único tom rosa já
	// registrado (`@theme`), então evita hex solto.
	attention: "bg-chart-5/15",
	danger: "bg-destructive/15",
};

/** Texto colorido — legível tanto sozinho (cards de resumo) quanto sobre o fundo pastel da mesma cor. */
const TONE_TEXT_TOKEN: Record<BalanceTone, string> = {
	success: "text-success",
	warning: "text-warning",
	attention: "text-chart-5",
	danger: "text-destructive",
};

export function getBalanceTextClass(
	balance: number,
	warningThreshold: number,
): string {
	return TONE_TEXT_TOKEN[getBalanceTone(balance, warningThreshold)];
}

export type BalanceCellTone = {
	background: string;
	text: string;
};

/**
 * Fundo pastel + texto colorido pra uma célula de saldo/orçamento,
 * coordenados pela FAIXA em que o valor cai (verde/amarelo/rosa/vermelho)
 * — igual formatação condicional de planilha: cor fixa por faixa, não um
 * gradiente proporcional ao valor.
 */
export function getBalanceCellTone(
	balance: number,
	warningThreshold: number,
): BalanceCellTone {
	const tone = getBalanceTone(balance, warningThreshold);

	return {
		background: TONE_BG_TOKEN[tone],
		text: TONE_TEXT_TOKEN[tone],
	};
}
