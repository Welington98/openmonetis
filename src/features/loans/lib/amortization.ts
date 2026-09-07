export type AmortizationSystem = "price" | "sac";

export type AmortizationInstallment = {
	installmentNumber: number;
	totalAmountCents: number;
	principalAmountCents: number;
	interestAmountCents: number;
	remainingBalanceAfterCents: number;
};

type GenerateAmortizationScheduleParams = {
	principalCents: number;
	monthlyRatePercent: number;
	installmentCount: number;
	system: AmortizationSystem;
};

/**
 * Gera a tabela de amortização em centavos inteiros. A última parcela sempre
 * força o saldo devedor a zerar exatamente, absorvendo ali qualquer resíduo
 * de arredondamento — como o saldo é carregado sequencialmente (cada parcela
 * depende do saldo anterior), distribuir o resto entre as primeiras parcelas
 * (como `splitAmount` faz pro parcelamento sem juros) não se aplica aqui.
 */
export function generateAmortizationSchedule({
	principalCents,
	monthlyRatePercent,
	installmentCount,
	system,
}: GenerateAmortizationScheduleParams): AmortizationInstallment[] {
	if (installmentCount <= 0 || principalCents <= 0) {
		return [];
	}

	const monthlyRate = monthlyRatePercent / 100;

	return system === "sac"
		? generateSac(principalCents, monthlyRate, installmentCount)
		: generatePrice(principalCents, monthlyRate, installmentCount);
}

/** Tabela Price (parcela fixa, exceto a última). */
function generatePrice(
	principalCents: number,
	monthlyRate: number,
	installmentCount: number,
): AmortizationInstallment[] {
	const fixedInstallmentCents =
		monthlyRate === 0
			? Math.round(principalCents / installmentCount)
			: Math.round(
					(principalCents * monthlyRate) /
						(1 - (1 + monthlyRate) ** -installmentCount),
				);

	const rows: AmortizationInstallment[] = [];
	let remainingCents = principalCents;

	for (let number = 1; number <= installmentCount; number += 1) {
		const isLast = number === installmentCount;
		const interestCents = Math.round(remainingCents * monthlyRate);
		const principal = isLast
			? remainingCents
			: fixedInstallmentCents - interestCents;
		const totalCents = isLast
			? principal + interestCents
			: fixedInstallmentCents;

		remainingCents -= principal;

		rows.push({
			installmentNumber: number,
			totalAmountCents: totalCents,
			principalAmountCents: principal,
			interestAmountCents: interestCents,
			remainingBalanceAfterCents: isLast ? 0 : remainingCents,
		});
	}

	return rows;
}

/** SAC (amortização de principal constante, exceto a última — parcela total decrescente). */
function generateSac(
	principalCents: number,
	monthlyRate: number,
	installmentCount: number,
): AmortizationInstallment[] {
	const basePrincipalCents = Math.floor(principalCents / installmentCount);

	const rows: AmortizationInstallment[] = [];
	let remainingCents = principalCents;

	for (let number = 1; number <= installmentCount; number += 1) {
		const isLast = number === installmentCount;
		const interestCents = Math.round(remainingCents * monthlyRate);
		const principal = isLast ? remainingCents : basePrincipalCents;

		remainingCents -= principal;

		rows.push({
			installmentNumber: number,
			totalAmountCents: principal + interestCents,
			principalAmountCents: principal,
			interestAmountCents: interestCents,
			remainingBalanceAfterCents: isLast ? 0 : remainingCents,
		});
	}

	return rows;
}
