import type { ImportedTransaction, ImportStatement } from "./types";

/**
 * Parser da fatura de cartão de crédito Sicredi em PDF (não é OCR — lê o
 * layer de texto do PDF via `pdfjs-dist`, mesmo worker usado em
 * `extract-pdf-text.ts`).
 *
 * A tabela de "Transações" da fatura é renderizada em colunas fixas (Data e
 * hora | Cidade | Compra | Descrição | Parcela | Valor em Dolar | Cotação do
 * dólar | Valor em reais) e cada célula normalmente chega como um único
 * text item do pdfjs — só descrições longas quebram em 2 linhas dentro da
 * mesma linha da tabela. Por isso a extração aqui é posicional (agrupa por Y
 * pra reconstruir a linha, classifica cada item pela faixa de X pra saber a
 * coluna) em vez do join sequencial usado pra comprovantes avulsos.
 */

type PositionedItem = { str: string; x: number; y: number };

const MONTH_ABBR: Record<string, number> = {
	jan: 1,
	fev: 2,
	mar: 3,
	abr: 4,
	mai: 5,
	jun: 6,
	jul: 7,
	ago: 8,
	set: 9,
	out: 10,
	nov: 11,
	dez: 12,
};

// Linha de tabela sempre começa com "DD/mon HH:MM" (ex.: "06/ago 12:44").
const ROW_DATE_RE = /^(\d{2})\/([a-zà-ú]{3})\s+(\d{2}):(\d{2})$/i;
// Valor final da linha (última coluna, "Valor em reais"); pode ser negativo
// (pagamento da fatura anterior).
const MONEY_RE = /^-?R\$\s?[\d.,]+$/;
const INSTALLMENT_RE = /^(\d{2})\/(\d{2})$/;
const VENCIMENTO_RE = /Vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/;
const CARD_LAST_DIGITS_RE = /final\s+(\d{3,4})/i;

// Faixas de X (pontos PDF) de cada coluna, calibradas contra a fatura Sicredi
// real (layout de colunas fixas, alinhadas à esquerda por coluna).
const COLUMN_RANGES = {
	cidade: [95, 160],
	compra: [160, 230],
	descricao: [230, 345],
	parcela: [345, 385],
} as const;

// Agrupamento de linhas de tabela é feito por proximidade de Y, não por
// igualdade exata: uma descrição longa quebra em 2 linhas de texto dentro da
// mesma linha da tabela (ex. "Nabu Casa Ha Cloud Nabucasa" + "Com Ca"), com
// gap vertical pequeno entre si (~4pt) contra o espaçamento normal entre
// linhas da tabela (~20-23pt).
const ROW_CLUSTER_GAP_THRESHOLD = 10;

async function extractPositionedPages(file: File): Promise<PositionedItem[][]> {
	const pdfjsLib = await import("pdfjs-dist");
	pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

	const arrayBuffer = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

	const pages: PositionedItem[][] = [];
	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		const items: PositionedItem[] = [];
		for (const item of content.items) {
			if (!("str" in item) || !("transform" in item)) continue;
			const str = item.str.trim();
			if (!str) continue;
			items.push({ str, x: item.transform[4], y: item.transform[5] });
		}
		pages.push(items);
	}
	return pages;
}

function clusterRows(items: PositionedItem[]): PositionedItem[][] {
	const sorted = [...items].sort((a, b) => b.y - a.y);
	const rows: PositionedItem[][] = [];
	let current: PositionedItem[] = [];
	let lastY: number | null = null;

	for (const item of sorted) {
		if (lastY !== null && lastY - item.y > ROW_CLUSTER_GAP_THRESHOLD) {
			rows.push(current);
			current = [];
		}
		current.push(item);
		lastY = item.y;
	}
	if (current.length > 0) rows.push(current);
	return rows;
}

function inColumnRange(
	x: number,
	[min, max]: readonly [number, number],
): boolean {
	return x >= min && x < max;
}

/** Junta itens de uma mesma coluna (linhas de texto quebradas) na ordem de leitura. */
function joinColumnItems(items: PositionedItem[]): string {
	return [...items]
		.sort((a, b) => b.y - a.y || a.x - b.x)
		.map((item) => item.str)
		.join(" ")
		.trim();
}

function parseMoneyToNumber(raw: string): number | null {
	const normalized = raw
		.replace(/R\$/g, "")
		.replace(/\s/g, "")
		.replace(/\./g, "")
		.replace(",", ".");
	const value = Number.parseFloat(normalized);
	return Number.isNaN(value) ? null : value;
}

function parseTransactionRow(
	row: PositionedItem[],
	referenceYear: number,
	referenceMonth: number,
): ImportedTransaction | null {
	const byX = [...row].sort((a, b) => a.x - b.x);
	const dateItem = byX[0];
	const dateMatch = dateItem ? ROW_DATE_RE.exec(dateItem.str) : null;
	if (!dateItem || !dateMatch) return null;

	const [, dayStr, monthAbbr, ,] = dateMatch;
	const month = MONTH_ABBR[monthAbbr.toLowerCase()];
	if (!month) return null;
	const day = Number.parseInt(dayStr, 10);
	// Fatura não imprime o ano por linha: mês de compra posterior ao mês de
	// referência (vencimento da própria fatura) indica ano anterior.
	const year = month > referenceMonth ? referenceYear - 1 : referenceYear;

	const valorItem = [...row]
		.filter((item) => item !== dateItem && MONEY_RE.test(item.str))
		.sort((a, b) => b.x - a.x)[0];
	if (!valorItem) return null;

	const signedAmount = parseMoneyToNumber(valorItem.str);
	if (signedAmount === null || signedAmount === 0) return null;

	const middle = row.filter((item) => item !== dateItem && item !== valorItem);
	const descricaoItems = middle.filter((item) =>
		inColumnRange(item.x, COLUMN_RANGES.descricao),
	);
	const parcelaItems = middle.filter((item) =>
		inColumnRange(item.x, COLUMN_RANGES.parcela),
	);

	const baseDescription = joinColumnItems(descricaoItems);
	if (!baseDescription) return null;
	// Pagamento da fatura anterior (crédito) — não é um novo lançamento.
	if (/^Pagamento\b/i.test(baseDescription)) return null;

	const installmentMatch = parcelaItems[0]
		? INSTALLMENT_RE.exec(parcelaItems[0].str)
		: null;
	const description = installmentMatch
		? `${baseDescription} (${Number.parseInt(installmentMatch[1], 10)}/${Number.parseInt(installmentMatch[2], 10)})`
		: baseDescription;

	return {
		externalId: null,
		externalIdOccurrence: 0,
		date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
		amount: Math.abs(signedAmount),
		description,
		sourceDescription: baseDescription,
		// Convenção da fatura: valor negativo = crédito/estorno na fatura
		// (pagamentos já são excluídos acima).
		transactionType: signedAmount < 0 ? "income" : "expense",
	};
}

function joinPageTextInOrder(items: PositionedItem[]): string {
	return items.map((item) => item.str).join(" ");
}

function isSicrediFatura(rawText: string): boolean {
	return (
		/sicredi/i.test(rawText) &&
		/transaç(ões|oes)/i.test(rawText) &&
		/cart[aã]o[^.]{0,40}\(final/i.test(rawText)
	);
}

export async function parseSicrediFatura(file: File): Promise<ImportStatement> {
	const pages = await extractPositionedPages(file);
	const rawText = pages.map(joinPageTextInOrder).join(" ");

	if (!isSicrediFatura(rawText)) {
		throw new Error(
			"PDF não reconhecido. Hoje só é possível importar fatura de cartão de crédito em PDF no formato da Sicredi.",
		);
	}

	const vencimentoMatch = VENCIMENTO_RE.exec(rawText);
	if (!vencimentoMatch) {
		throw new Error(
			"Não foi possível encontrar o vencimento da fatura no PDF.",
		);
	}
	const referenceMonth = Number.parseInt(vencimentoMatch[2] ?? "", 10);
	const referenceYear = Number.parseInt(vencimentoMatch[3] ?? "", 10);

	const cardLastDigitsMatch = CARD_LAST_DIGITS_RE.exec(rawText);
	const accountNumber = cardLastDigitsMatch?.[1] ?? null;

	const transactions: ImportedTransaction[] = [];
	for (const pageItems of pages) {
		for (const row of clusterRows(pageItems)) {
			const transaction = parseTransactionRow(
				row,
				referenceYear,
				referenceMonth,
			);
			if (transaction) transactions.push(transaction);
		}
	}

	if (transactions.length === 0) {
		throw new Error("Nenhum lançamento encontrado na fatura.");
	}

	const dates = transactions.map((t) => t.date).sort();
	const period = { from: dates[0], to: dates[dates.length - 1] };

	return {
		source: "Sicredi",
		accountNumber,
		period,
		isCreditCard: true,
		transactions,
	};
}
