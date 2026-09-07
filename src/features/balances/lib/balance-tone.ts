export type BalanceTone = "success" | "warning" | "danger";

/**
 * Verde/âmbar/vermelho pelo mesmo critério da planilha de referência: saldo
 * negativo é sempre vermelho; abaixo de `warningThreshold` (ex: reserva de
 * segurança, ou cota diária × 7) é âmbar; senão verde. Cor nunca é o único
 * sinal — o valor numérico já traz o sinal.
 */
export function getBalanceTone(
	balance: number,
	warningThreshold: number,
): BalanceTone {
	if (balance < 0) return "danger";
	if (balance < warningThreshold) return "warning";
	return "success";
}

const TONE_BG_TOKEN: Record<BalanceTone, string> = {
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-destructive",
};

/** Texto colorido sobre fundo tênue — usado nos degraus mais fracos. */
const TONE_TEXT_ON_TINT: Record<BalanceTone, string> = {
	success: "text-success",
	warning: "text-warning",
	danger: "text-destructive",
};

/** Texto claro/escuro de contraste (tokens `-foreground` do design system) — usado sobre fundo sólido/vibrante. */
const TONE_TEXT_ON_SOLID: Record<BalanceTone, string> = {
	success: "text-success-foreground",
	warning: "text-warning-foreground",
	danger: "text-destructive-foreground",
};

/**
 * Degraus de opacidade do fundo — do tênue (dia dentro da média) ao sólido
 * e vibrante (dia extremo), igual ao mapa de calor da planilha de
 * referência. `""` = token sem sufixo de opacidade, ou seja 100% opaco.
 */
const INTENSITY_OPACITY = ["/15", "/30", "/50", "/75", ""] as const;

/**
 * Só o ÚLTIMO degrau (100% opaco) troca pro texto `-foreground`: nos
 * degraus intermediários (`/75` etc.) o fundo ainda é uma mistura com o
 * fundo da página, não a cor sólida em si — texto quase branco (pensado
 * pra contraste sobre a cor cheia) fica ilegível ali. Texto colorido comum
 * continua legível em qualquer opacidade porque nunca é mais claro que o
 * próprio tom da célula.
 */
const SOLID_STEP_THRESHOLD = INTENSITY_OPACITY.length - 1;

/**
 * Degrau de intensidade (0-4) pelo módulo do saldo relativo a uma
 * referência (ex: maior |saldo| da janela inteira sendo exibida).
 */
export function getBalanceIntensityStep(
	balance: number,
	referenceMagnitude: number,
): number {
	if (referenceMagnitude <= 0) {
		return 2;
	}
	const ratio = Math.min(Math.abs(balance) / referenceMagnitude, 1);
	return Math.min(
		Math.floor(ratio * INTENSITY_OPACITY.length),
		INTENSITY_OPACITY.length - 1,
	);
}

/** Texto colorido simples (sem fundo) — pra estatísticas fora de tabela, como os cards de resumo. */
export function getBalanceTextClass(
	balance: number,
	warningThreshold: number,
): string {
	return TONE_TEXT_ON_TINT[getBalanceTone(balance, warningThreshold)];
}

export type BalanceCellTone = {
	background: string;
	text: string;
	/** Degrau sólido o bastante pra pedir peso de fonte maior (badge-like), igual à planilha de referência. */
	isSolid: boolean;
};

/**
 * Classe de fundo + texto pra uma célula de saldo, coordenadas entre si: em
 * fundo tênue usa texto colorido comum (`text-success` etc.); em fundo
 * sólido/vibrante troca pro token `-foreground` correspondente (contraste
 * de propósito, já definido no design system) em vez de texto colorido
 * sobre fundo colorido, que perderia legibilidade.
 */
export function getBalanceCellTone(
	balance: number,
	warningThreshold: number,
	referenceMagnitude: number,
): BalanceCellTone {
	const tone = getBalanceTone(balance, warningThreshold);
	const step = getBalanceIntensityStep(balance, referenceMagnitude);
	const isSolid = step >= SOLID_STEP_THRESHOLD;

	return {
		background: `${TONE_BG_TOKEN[tone]}${INTENSITY_OPACITY[step]}`,
		text: isSolid ? TONE_TEXT_ON_SOLID[tone] : TONE_TEXT_ON_TINT[tone],
		isSolid,
	};
}
