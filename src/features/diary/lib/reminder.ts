import { DIARY_REMINDER_MESSAGES } from "@/features/diary/lib/constants";

export type ShouldShowReminderInput = {
	reminderEnabled: boolean;
	/** "HH:mm" configurado pelo usuário. */
	reminderTime: string;
	hasCheckedInToday: boolean;
	/** "HH:mm" atual no fuso de negócio do app. */
	currentTime: string;
};

/**
 * Não há infraestrutura de push neste app — o lembrete é um banner in-app
 * calculado a cada carregamento de página, nunca enviado proativamente.
 */
export function shouldShowReminder(input: ShouldShowReminderInput): boolean {
	if (!input.reminderEnabled || input.hasCheckedInToday) {
		return false;
	}
	// Comparação de string funciona porque ambos os lados são "HH:mm" com
	// zero-padding.
	return input.currentTime >= input.reminderTime;
}

/** Escolhe uma mensagem do pool de forma determinística a partir de um seed (ex: dia do ano). */
export function pickReminderMessage(seed: number): string {
	const index =
		((seed % DIARY_REMINDER_MESSAGES.length) + DIARY_REMINDER_MESSAGES.length) %
		DIARY_REMINDER_MESSAGES.length;
	return DIARY_REMINDER_MESSAGES[index];
}
