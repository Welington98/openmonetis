export type BalanceTone = "success" | "warning" | "attention" | "danger";

/**
 * Verde/amarelo/rosa/vermelho, em 4 faixas em torno de zero e de
 * `warningThreshold` (ex: reserva de segurança, ou cota diária × 7):
 * - `success` (verde): saldo confortável, acima da reserva.
 * - `warning` (amarelo): positivo, mas já abaixo da reserva — atenção.
 * - `attention` (rosa): negativo, mas ainda dentro de uma reserva de
 *   margem — dá pra recuperar sem alarde.
 * - `danger` (vermelho): negativo além da margem — estouro sério.
 *
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

const TONE_BG_TOKEN: Record<BalanceTone, string> = {
	success: "bg-success",
	warning: "bg-warning",
	// Rosa reaproveita o token de gráfico `chart-5` (pink-500) — não é uma
	// cor semântica própria do design system, mas é o único tom rosa já
	// registrado (`@theme`), então evita hex solto.
	attention: "bg-chart-5",
	danger: "bg-destructive",
};

/** Texto de contraste (tokens `-foreground` do design system) pra cima do fundo sólido de cada faixa. */
const TONE_TEXT_TOKEN: Record<BalanceTone, string> = {
	success: "text-success-foreground",
	warning: "text-warning-foreground",
	// `chart-5` não tem um `-foreground` próprio (é token de gráfico, não
	// semântico) — branco tem contraste suficiente sobre pink-500.
	attention: "text-white",
	danger: "text-destructive-foreground",
};

/** Texto colorido simples (sem fundo) — pra estatísticas fora de tabela, como os cards de resumo. */
const TONE_TEXT_ON_LIGHT: Record<BalanceTone, string> = {
	success: "text-success",
	warning: "text-warning",
	attention: "text-chart-5",
	danger: "text-destructive",
};

export function getBalanceTextClass(
	balance: number,
	warningThreshold: number,
): string {
	return TONE_TEXT_ON_LIGHT[getBalanceTone(balance, warningThreshold)];
}

export type BalanceCellTone = {
	background: string;
	text: string;
};

/**
 * Fundo sólido + texto de contraste pra uma célula de saldo, igual
 * formatação condicional de planilha: a cor é fixa pela FAIXA em que o
 * saldo cai (verde/amarelo/rosa/vermelho), não um gradiente proporcional
 * ao valor — evita que um dia claramente arriscado apareça desbotado só
 * porque não é o mais extremo da janela inteira.
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
