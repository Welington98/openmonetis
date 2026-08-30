export const DIARY_CATEGORIES = [
	{ value: "alimentacao", label: "Alimentação" },
	{ value: "transporte", label: "Transporte" },
	{ value: "lazer", label: "Lazer" },
	{ value: "contas", label: "Contas" },
	{ value: "outro", label: "Outro" },
] as const;

export type DiaryCategory = (typeof DIARY_CATEGORIES)[number]["value"];

export const DIARY_CLASSIFICATIONS = [
	{ value: "planejado", label: "Planejado" },
	{ value: "impulsivo", label: "Impulsivo" },
	{ value: "necessario", label: "Necessário" },
] as const;

export type DiaryClassification =
	(typeof DIARY_CLASSIFICATIONS)[number]["value"];

export const DIARY_REMINDER_DEFAULT_TIME = "20:00";

export const DIARY_REMINDER_TIME_PRESETS = ["19:00", "20:00", "21:00", "22:00"];

export const DIARY_REMINDER_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const DIARY_ROLLING_AVERAGE_WINDOW_DAYS = 30;

export type DiaryBadgeKey =
	| "streak_7"
	| "streak_30"
	| "streak_100"
	| "month_no_budget_overrun";

/** Sentinela para o campo `period` das conquistas que não são mensais (streaks). */
export const DIARY_BADGE_NO_PERIOD = "";

export const DIARY_STREAK_BADGE_THRESHOLDS: Array<{
	key: Extract<DiaryBadgeKey, "streak_7" | "streak_30" | "streak_100">;
	days: number;
	label: string;
}> = [
	{ key: "streak_7", days: 7, label: "7 dias seguidos" },
	{ key: "streak_30", days: 30, label: "30 dias seguidos" },
	{ key: "streak_100", days: 100, label: "100 dias seguidos" },
];

export const DIARY_MONTH_NO_OVERRUN_BADGE = {
	key: "month_no_budget_overrun" as const,
	label: "Mês sem estourar o orçamento",
};

/** Quantos meses fechados para trás avaliamos preguiçosamente ao abrir "minhas conquistas". */
export const DIARY_MONTH_BADGE_LOOKBACK_MONTHS = 12;

export const DIARY_REMINDER_MESSAGES = [
	"Como foi seu dinheiro hoje?",
	"Faltam poucos minutos pra fechar o dia — já registrou?",
	"Duas linhas e pronto: como foi seu dia financeiro?",
	"Não deixe sua sequência quebrar — registre o dia de hoje.",
	"Um check-in rápido antes de dormir: como foi hoje?",
];
