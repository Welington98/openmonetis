function isTableMissingError(error: unknown, tableName: string): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();

	return (
		message.includes(tableName) &&
		(message.includes("does not exist") || message.includes("relation"))
	);
}

/**
 * Detecta se um erro indica que a tabela `dashboard_notification_states`
 * ainda nao existe no banco (migration pendente).
 */
export function isNotificationStatesTableMissing(error: unknown): boolean {
	return isTableMissingError(error, "dashboard_notification_states");
}

/**
 * Detecta se um erro indica que a tabela `push_subscriptions`
 * ainda nao existe no banco (migration pendente).
 */
export function isPushSubscriptionsTableMissing(error: unknown): boolean {
	return isTableMissingError(error, "push_subscriptions");
}
