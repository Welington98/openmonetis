export type CalculateRealAvailableBalanceInput = {
	/** Saldo atual de verdade nas contas consideradas (não excluídas), soma de tudo que já é seu, hoje. */
	currentAccountsBalance: number;
	/** Receita ainda não recebida neste período (purchaseDate > hoje) — ainda não está no saldo das contas. */
	futureIncome: number;
	/**
	 * Despesa deste período fora do cartão de crédito que ainda vai sair da
	 * conta (purchaseDate > hoje) — Pix/boleto/dinheiro já lançados pra
	 * frente. A que já foi paga (settled) já saiu do saldo, não entra aqui
	 * de novo.
	 */
	nonCardFutureExpenses: number;
	/**
	 * Débito de cartão deste período que ainda não foi pago (fatura em
	 * aberto) — cobre TANTO compras já feitas quanto parcelas futuras já
	 * lançadas na mesma fatura, porque nenhuma das duas sai da conta até o
	 * pagamento da fatura acontecer. Fatura já paga não entra aqui (o
	 * pagamento já é um lançamento normal, já refletido no saldo atual).
	 */
	unpaidCardDebt: number;
	targetSavings: number;
	safetyBuffer: number;
};

export type RealAvailableBalanceResult = {
	/** Pode ser negativo (compromissos futuros já conhecidos excedem o que você tem + vai receber). */
	realAvailableBalance: number;
};

/**
 * disponível_real = saldo_atual_das_contas + receita_futura_conhecida
 *                 - despesas_futuras_fora_do_cartão - débito_de_cartão_não_pago
 *                 - meta_de_economia - reserva_de_segurança
 *
 * Diferente de `calculateAvailableBalance` (que parte do orçamento
 * cadastrado, um número que o usuário digitou), esse cálculo parte do
 * dinheiro que existe de verdade: o saldo das contas, que já reflete tudo
 * que já foi gasto/recebido fora do cartão até agora (não precisa descontar
 * de novo o que já saiu). Só entra no cálculo o que ainda vai sair: despesa
 * fora do cartão já lançada pra frente, e a fatura de cartão em aberto
 * (inteira, não importa se a compra já aconteceu ou ainda vai acontecer,
 * porque o cartão só sai da conta quando a fatura é paga).
 *
 * Como o saldo das contas não zera a cada mês, um mês estourado
 * automaticamente reduz o disponível do mês seguinte — não precisa de
 * nenhum estado extra pra "herdar" o estouro de um mês pro outro.
 */
export function calculateRealAvailableBalance({
	currentAccountsBalance,
	futureIncome,
	nonCardFutureExpenses,
	unpaidCardDebt,
	targetSavings,
	safetyBuffer,
}: CalculateRealAvailableBalanceInput): RealAvailableBalanceResult {
	return {
		realAvailableBalance:
			currentAccountsBalance +
			futureIncome -
			nonCardFutureExpenses -
			unpaidCardDebt -
			targetSavings -
			safetyBuffer,
	};
}
