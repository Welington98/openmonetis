export const COST_CENTER_KINDS = ["fixa", "variavel", "economia"] as const;

export type CostCenterKind = (typeof COST_CENTER_KINDS)[number];

export const COST_CENTER_KIND_LABEL: Record<CostCenterKind, string> = {
	fixa: "Fixa",
	variavel: "Variável",
	economia: "Economia",
};

export const COST_CENTER_KIND_DESCRIPTION: Record<CostCenterKind, string> = {
	fixa: "Descontada do orçamento do mês inteiro logo no dia 1º — pagar em qualquer dia não afeta a cota diária.",
	variavel: "Gasto do dia a dia — é o que a cota diária mede.",
	economia: "Só para relatórios — não entra no cálculo da cota diária.",
};

export const DEFAULT_COST_CENTERS: ReadonlyArray<{
	name: string;
	kind: CostCenterKind;
}> = [
	{ name: "Fixa", kind: "fixa" },
	{ name: "Variável", kind: "variavel" },
	{ name: "Economia", kind: "economia" },
];
