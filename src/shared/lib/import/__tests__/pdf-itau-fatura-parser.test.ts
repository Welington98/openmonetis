import { describe, expect, it } from "vitest";
import { parseItauFaturaFromPages } from "../pdf-itau-fatura-parser";

/**
 * Fixtures sintéticas (dados fictícios) que reproduzem o layout da fatura
 * Itaú: duas colunas por página, cada transação em duas linhas visuais
 * (principal + categoria/cidade), seção "Pagamentos efetuados" antes da
 * tabela e "Compras parceladas - próximas faturas" depois dela.
 */

type Item = { str: string; x: number; y: number };

// Item isolado bem à direita: empurra o ponto médio de X calculado por
// splitColumns para fora do range do conteúdo real de teste, garantindo que
// um único "bloco" de conteúdo não seja indevidamente cortado em duas
// colunas (ver pdf-itau-fatura-parser.ts:splitColumns).
const ANCHOR: Item = { str: ".", x: 1000, y: 1 };

function preamble(emissao: string): Item[] {
	return [
		{ str: "itaú", x: 10, y: 1300 },
		{ str: "Resumo da fatura", x: 10, y: 1280 },
		{ str: "Emissão:", x: 10, y: 1260 },
		{ str: emissao, x: 60, y: 1260 },
		{ str: "Cartão", x: 10, y: 1240 },
		{ str: "5149.XXXX.XXXX.2524", x: 60, y: 1240 },
	];
}

const SECTION_START: Item[] = [
	{ str: "Lançamentos:", x: 10, y: 910 },
	{ str: "compras e saques", x: 40, y: 910 },
];

const HEADER: Item[] = [
	{ str: "DATA", x: 10, y: 880 },
	{ str: "ESTABELECIMENTO", x: 30, y: 880 },
	{ str: "VALOR EM R$", x: 70, y: 880 },
];

function endMarker(total: string, y: number): Item[] {
	return [
		{ str: "Total dos lançamentos atuais", x: 10, y },
		{ str: total, x: 80, y },
	];
}

describe("parseItauFaturaFromPages", () => {
	it("importa lançamentos simples e com parcela, ignorando pagamentos efetuados e compras parceladas futuras", () => {
		const pages: Item[][] = [
			[
				...preamble("03/09/2026"),
				// "Pagamentos efetuados": antes do marcador de início da seção,
				// nunca deveria virar lançamento mesmo parecendo uma transação.
				{ str: "Pagamentos efetuados", x: 10, y: 1000 },
				{ str: "04/08", x: 10, y: 980 },
				{ str: "Pagamento via conta", x: 30, y: 980 },
				{ str: "-952,29", x: 80, y: 980 },
				// Coluna esquerda da tabela de lançamentos.
				...SECTION_START,
				{ str: "WELINGTON TESTE", x: 10, y: 895 },
				...HEADER,
				{ str: "01/05", x: 10, y: 860 },
				{ str: "Loja Teste", x: 30, y: 860 },
				{ str: "50,00", x: 80, y: 860 },
				{ str: "outros", x: 30, y: 845 },
				{ str: "Cidade Teste", x: 50, y: 845 },
				// Coluna direita: cabeçalho repetido, transação com parcela,
				// marcador de fim e, depois dele, compras parceladas futuras
				// (não deveriam gerar lançamento).
				{ str: "DATA", x: 500, y: 1000 },
				{ str: "ESTABELECIMENTO", x: 530, y: 1000 },
				{ str: "VALOR EM R$", x: 570, y: 1000 },
				{ str: "02/05", x: 500, y: 980 },
				{ str: "Mercado X", x: 530, y: 980 },
				{ str: "01/03", x: 560, y: 980 },
				{ str: "100,00", x: 580, y: 980 },
				{ str: "supermercado", x: 530, y: 965 },
				{ str: "Outra Cidade", x: 560, y: 965 },
				{ str: "Total dos lançamentos atuais", x: 500, y: 940 },
				{ str: "150,00", x: 580, y: 940 },
				{ str: "Compras parceladas - próximas faturas", x: 500, y: 900 },
				{ str: "03/06", x: 500, y: 880 },
				{ str: "Loja Futura", x: 530, y: 880 },
				{ str: "20,00", x: 580, y: 880 },
			],
		];

		const result = parseItauFaturaFromPages(pages);

		expect(result.source).toBe("Itaú");
		expect(result.accountNumber).toBe("2524");
		expect(result.isCreditCard).toBe(true);
		expect(result.period).toEqual({ from: "2026-05-01", to: "2026-05-02" });
		expect(result.transactions).toEqual([
			expect.objectContaining({
				date: "2026-05-01",
				amount: 50,
				description: "Loja Teste",
				transactionType: "expense",
			}),
			expect.objectContaining({
				date: "2026-05-02",
				amount: 100,
				description: "Mercado X (1/3)",
				transactionType: "expense",
			}),
		]);
	});

	it("infere o ano anterior quando o mês da transação é posterior ao mês de emissão", () => {
		const pages: Item[][] = [
			[
				...preamble("05/01/2027"),
				ANCHOR,
				...SECTION_START,
				...HEADER,
				{ str: "15/12", x: 10, y: 860 },
				{ str: "Loja Dez", x: 30, y: 860 },
				{ str: "10,00", x: 80, y: 860 },
				{ str: "outros", x: 30, y: 845 },
				{ str: "Cidade X", x: 50, y: 845 },
				...endMarker("10,00", 800),
			],
		];

		const result = parseItauFaturaFromPages(pages);

		expect(result.transactions).toHaveLength(1);
		expect(result.transactions[0]?.date).toBe("2026-12-15");
	});

	it("lança erro quando a soma dos lançamentos não reconcilia com o total impresso", () => {
		const pages: Item[][] = [
			[
				...preamble("03/09/2026"),
				ANCHOR,
				...SECTION_START,
				...HEADER,
				{ str: "01/05", x: 10, y: 860 },
				{ str: "Loja Teste", x: 30, y: 860 },
				{ str: "50,00", x: 80, y: 860 },
				{ str: "outros", x: 30, y: 845 },
				{ str: "Cidade Teste", x: 50, y: 845 },
				...endMarker("999,99", 800),
			],
		];

		expect(() => parseItauFaturaFromPages(pages)).toThrow(/não bateu/i);
	});

	it("lança erro quando o PDF não é reconhecido como fatura Itaú", () => {
		const pages: Item[][] = [[{ str: "documento qualquer", x: 10, y: 10 }]];

		expect(() => parseItauFaturaFromPages(pages)).toThrow(/não reconhecido/i);
	});

	it("lança erro quando nenhum lançamento é encontrado na fatura", () => {
		const pages: Item[][] = [
			[
				...preamble("03/09/2026"),
				ANCHOR,
				...SECTION_START,
				...HEADER,
				...endMarker("0,00", 800),
			],
		];

		expect(() => parseItauFaturaFromPages(pages)).toThrow(/nenhum lançamento/i);
	});
});
