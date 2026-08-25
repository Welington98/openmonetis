const PASSIVO_KEYWORDS = ["cartao", "cartão", "credito", "crédito"];

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

const normalize = (value: string) =>
	value.normalize("NFD").replace(DIACRITICS_PATTERN, "").toLowerCase();

export type AccountClassification = "ativo" | "passivo";

/**
 * `accountType` é texto livre (sem enum de banco), então qualquer tipo não
 * reconhecido como passivo (cartão/crédito) é tratado como ativo por padrão.
 */
export function classifyAccountType(
	accountType: string,
): AccountClassification {
	const normalized = normalize(accountType);
	const isPassivo = PASSIVO_KEYWORDS.some((keyword) =>
		normalized.includes(normalize(keyword)),
	);
	return isPassivo ? "passivo" : "ativo";
}

export type BalanceSheetAccount = {
	id: string;
	name: string;
	accountType: string;
	logo: string | null;
	balance: number;
	classification: AccountClassification;
};

export type BalanceSheetTotals = {
	ativo: number;
	passivo: number;
	patrimonioLiquido: number;
};

/**
 * Passivo é exibido como valor positivo de dívida — o saldo de uma conta de
 * passivo (ex.: cartão de crédito) já vem negativo no cálculo de saldo
 * existente, então o sinal é invertido só para apresentação.
 */
export function computeBalanceSheetTotals(
	accounts: Pick<BalanceSheetAccount, "balance" | "classification">[],
): BalanceSheetTotals {
	const ativo = accounts
		.filter((account) => account.classification === "ativo")
		.reduce((total, account) => total + account.balance, 0);

	const passivo = accounts
		.filter((account) => account.classification === "passivo")
		.reduce((total, account) => total + account.balance, 0);

	const passivoAsDebt = passivo < 0 ? -passivo : passivo;

	return {
		ativo,
		passivo: passivoAsDebt,
		patrimonioLiquido: ativo - passivoAsDebt,
	};
}
