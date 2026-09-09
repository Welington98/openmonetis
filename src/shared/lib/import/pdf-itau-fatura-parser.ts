import type { ImportedTransaction, ImportStatement } from "./types";

/**
 * Parser da fatura de cartão de crédito Itaú em PDF (lê o layer de texto do
 * PDF via `pdfjs-dist`, mesmo worker usado em `pdf-sicredi-fatura-parser.ts`).
 *
 * Layout da fatura Itaú, diferente da Sicredi:
 * - A tabela "Lançamentos: compras e saques" é renderizada em duas colunas
 *   por página (o cabeçalho da tabela se repete no topo da segunda coluna).
 * - Cada transação ocupa duas linhas visuais: a linha principal
 *   ("DD/MM ESTABELECIMENTO [NN/NN] VALOR") e uma linha auxiliar de
 *   categoria/cidade abaixo, sem data nem valor — essa linha auxiliar é
 *   apenas pulada, não é parseada campo a campo.
 * - Datas da tabela não têm ano nem hora (`DD/MM`).
 * - Valores na tabela não têm o prefixo "R$".
 *
 * As seções "Pagamentos efetuados" (antes da tabela) e "Compras parceladas -
 * próximas faturas" (depois da tabela) ficam fora da janela de início/fim
 * reconhecida abaixo, então são naturalmente excluídas sem regra extra.
 */

type PositionedItem = { str: string; x: number; y: number };

// Linha de transação sempre começa com "DD/MM" (sem hora, sem ano).
const ROW_DATE_RE = /^(\d{2})\/(\d{2})$/;
// Valor da tabela de lançamentos não tem prefixo "R$" (ex.: "32,08", "1.221,57").
const MONEY_RE = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
// Marcador de parcela embutido no final do nome do estabelecimento (ex.: "04/04").
const INSTALLMENT_RE = /^(\d{2})\/(\d{2})$/;
const SECTION_START_RE = /lan[çc]amentos:\s*compras e saques/i;
const SECTION_HEADER_RE = /^data\s+estabelecimento\s+valor em r\$/i;
const SECTION_END_RE =
	/^(lan[çc]amentos no cart[aã]o|total dos lan[çc]amentos atuais)\b/i;
const EMISSAO_RE = /Emiss[aã]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i;
const CARD_LAST_DIGITS_RE = /Cart[aã]o\s+\d{4}\.XXXX\.XXXX\.(\d{4})/i;

// Threshold de agrupamento por Y menor que o da Sicredi de propósito: aqui
// cada linha visual (principal ou auxiliar) precisa ficar em uma linha
// própria — não queremos juntar a linha principal com a auxiliar abaixo
// dela. Calibrado sem acesso às coordenadas reais do pdfjs; ajustar contra
// o PDF real se linhas forem agrupadas ou separadas incorretamente.
const ROW_CLUSTER_GAP_THRESHOLD = 5;

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

/**
 * Divide os itens de uma página em coluna esquerda/direita a partir do
 * ponto médio de X observado na própria página (aproxima a largura real da
 * página sem depender do viewport do pdfjs, o que mantém a função de
 * orquestração pura e testável com fixtures sintéticas).
 */
function splitColumns(pageItems: PositionedItem[]): PositionedItem[][] {
	if (pageItems.length === 0) return [[], []];
	const xs = pageItems.map((item) => item.x);
	const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
	const left = pageItems.filter((item) => item.x < midX);
	const right = pageItems.filter((item) => item.x >= midX);
	return [left, right];
}

function joinRowText(row: PositionedItem[]): string {
	return [...row]
		.sort((a, b) => a.x - b.x)
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

	const [, dayStr, monthStr] = dateMatch;
	const month = Number.parseInt(monthStr, 10);
	const day = Number.parseInt(dayStr, 10);
	// Fatura não imprime o ano por linha: mês de compra posterior ao mês de
	// emissão (fechamento da própria fatura) indica ano anterior.
	const year = month > referenceMonth ? referenceYear - 1 : referenceYear;

	const valorItem = [...row]
		.filter((item) => item !== dateItem && MONEY_RE.test(item.str))
		.sort((a, b) => b.x - a.x)[0];
	if (!valorItem) return null;

	const signedAmount = parseMoneyToNumber(valorItem.str);
	if (signedAmount === null || signedAmount === 0) return null;

	const middle = [...row]
		.filter((item) => item !== dateItem && item !== valorItem)
		.sort((a, b) => a.x - b.x);
	if (middle.length === 0) return null;

	const lastMiddle = middle[middle.length - 1];
	const installmentMatch = lastMiddle
		? INSTALLMENT_RE.exec(lastMiddle.str)
		: null;
	const descriptionItems = installmentMatch ? middle.slice(0, -1) : middle;

	const baseDescription = descriptionItems
		.map((item) => item.str)
		.join(" ")
		.trim();
	if (!baseDescription) return null;

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
		// Convenção da fatura: valor negativo = crédito/estorno na fatura.
		transactionType: signedAmount < 0 ? "income" : "expense",
	};
}

function joinPageTextInOrder(items: PositionedItem[]): string {
	return items.map((item) => item.str).join(" ");
}

function isItauFatura(rawText: string): boolean {
	return (
		/ita[uú]/i.test(rawText) &&
		SECTION_START_RE.test(rawText) &&
		/resumo da fatura/i.test(rawText)
	);
}

/**
 * Núcleo puro do parser: recebe as páginas já extraídas e posicionadas (sem
 * I/O de arquivo/pdfjs), o que permite testar com fixtures sintéticas de
 * `{str, x, y}` em vez de um PDF real.
 */
export function parseItauFaturaFromPages(
	pages: PositionedItem[][],
): ImportStatement {
	const rawText = pages.map(joinPageTextInOrder).join(" ");

	if (!isItauFatura(rawText)) {
		throw new Error(
			"PDF não reconhecido. Hoje só é possível importar fatura de cartão de crédito em PDF no formato da Sicredi ou do Itaú.",
		);
	}

	const emissaoMatch = EMISSAO_RE.exec(rawText);
	if (!emissaoMatch) {
		throw new Error("Não foi possível encontrar a emissão da fatura no PDF.");
	}
	const referenceMonth = Number.parseInt(emissaoMatch[2] ?? "", 10);
	const referenceYear = Number.parseInt(emissaoMatch[3] ?? "", 10);

	const cardLastDigitsMatch = CARD_LAST_DIGITS_RE.exec(rawText);
	const accountNumber = cardLastDigitsMatch?.[1] ?? null;

	const transactions: ImportedTransaction[] = [];
	let capturing = false;
	let finishedCapturing = false;
	let capturedTotal: number | null = null;

	for (const pageItems of pages) {
		const [leftColumn, rightColumn] = splitColumns(pageItems);
		for (const columnItems of [leftColumn, rightColumn]) {
			for (const row of clusterRows(columnItems)) {
				const rowText = joinRowText(row);

				if (!capturing) {
					if (!finishedCapturing && SECTION_START_RE.test(rowText)) {
						capturing = true;
					}
					continue;
				}

				if (SECTION_END_RE.test(rowText)) {
					const totalItem = [...row]
						.filter((item) => MONEY_RE.test(item.str))
						.sort((a, b) => b.x - a.x)[0];
					if (totalItem) capturedTotal = parseMoneyToNumber(totalItem.str);
					capturing = false;
					finishedCapturing = true;
					continue;
				}

				if (SECTION_HEADER_RE.test(rowText)) {
					continue;
				}

				const transaction = parseTransactionRow(
					row,
					referenceYear,
					referenceMonth,
				);
				if (transaction) {
					transactions.push(transaction);
				}
				// Se não é transação, é uma linha auxiliar (categoria/cidade da
				// transação anterior, título da seção, nome do titular) — pula.
			}
		}
	}

	if (transactions.length === 0) {
		throw new Error("Nenhum lançamento encontrado na fatura.");
	}

	if (capturedTotal !== null) {
		const sum = transactions.reduce(
			(acc, t) => acc + (t.transactionType === "income" ? -t.amount : t.amount),
			0,
		);
		if (Math.abs(sum - capturedTotal) > 0.01) {
			throw new Error(
				"A soma dos lançamentos não bateu com o total impresso na fatura. A leitura do PDF pode estar incompleta.",
			);
		}
	}

	const dates = transactions.map((t) => t.date).sort();
	const period = { from: dates[0], to: dates[dates.length - 1] };

	return {
		source: "Itaú",
		accountNumber,
		period,
		isCreditCard: true,
		transactions,
	};
}

export async function parseItauFatura(file: File): Promise<ImportStatement> {
	const pages = await extractPositionedPages(file);
	return parseItauFaturaFromPages(pages);
}
