/**
 * Heurísticas de regex (PT-BR) para extrair valor, data, tipo e descrição do
 * texto de um comprovante de Pix/transferência já extraído de um PDF.
 * Função pura, sem I/O — recebe uma string e devolve os campos encontrados.
 */

export type ParsedReceiptType = "Receita" | "Despesa";

export interface ParsedReceipt {
	amount: number | null;
	date: string | null; // "YYYY-MM-DD"
	transactionType: ParsedReceiptType;
	description: string | null;
}

const AMOUNT_ANCHOR_PATTERN =
	/(valor\s+pago|valor\s+da\s+transfer[êe]ncia|valor\s+total|valor\s+transferido|valor\s+enviado)[^\dR]{0,20}(r\$\s?[\d.,]+)/i;
const AMOUNT_FALLBACK_PATTERN = /r\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/i;

const MONTH_NAMES: Record<string, string> = {
	janeiro: "01",
	fevereiro: "02",
	março: "03",
	marco: "03",
	abril: "04",
	maio: "05",
	junho: "06",
	julho: "07",
	agosto: "08",
	setembro: "09",
	outubro: "10",
	novembro: "11",
	dezembro: "12",
};

const NUMERIC_DATE_PATTERN = /(\d{2})\/(\d{2})\/(\d{4})/;
const WRITTEN_DATE_PATTERN = /(\d{1,2})\s+de\s+([a-zçã]+)\s+de\s+(\d{4})/i;

const INCOME_KEYWORDS = [
	"você recebeu",
	"voce recebeu",
	"depósito recebido",
	"deposito recebido",
	"recebimento",
];

const DESCRIPTION_LABEL_PATTERN =
	/(?:favorecido|beneficiári[oa]|beneficiario|para)\s*:?\s*(.+)/i;

function parseBrazilianAmount(raw: string): number | null {
	const normalized = raw
		.replace(/r\$\s?/i, "")
		.trim()
		.replace(/\./g, "")
		.replace(",", ".");
	const value = Number.parseFloat(normalized);
	return Number.isFinite(value) ? value : null;
}

function extractAmount(text: string): number | null {
	const anchored = text.match(AMOUNT_ANCHOR_PATTERN);
	if (anchored?.[2]) {
		return parseBrazilianAmount(anchored[2]);
	}
	const fallback = text.match(AMOUNT_FALLBACK_PATTERN);
	if (fallback?.[1]) {
		return parseBrazilianAmount(fallback[1]);
	}
	return null;
}

function extractDate(text: string): string | null {
	const numeric = text.match(NUMERIC_DATE_PATTERN);
	if (numeric) {
		const [, day, month, year] = numeric;
		return `${year}-${month}-${day}`;
	}

	const written = text.match(WRITTEN_DATE_PATTERN);
	if (written) {
		const [, day, monthName, year] = written;
		const month = MONTH_NAMES[monthName.toLowerCase()];
		if (month) {
			return `${year}-${month}-${day.padStart(2, "0")}`;
		}
	}

	return null;
}

function extractTransactionType(text: string): ParsedReceiptType {
	const lower = text.toLowerCase();
	return INCOME_KEYWORDS.some((keyword) => lower.includes(keyword))
		? "Receita"
		: "Despesa";
}

function extractDescription(text: string): string | null {
	for (const line of text.split("\n")) {
		const match = line.match(DESCRIPTION_LABEL_PATTERN);
		if (match?.[1]) {
			const value = match[1].trim();
			if (value) return value;
		}
	}
	return null;
}

export function parseReceiptText(text: string): ParsedReceipt {
	return {
		amount: extractAmount(text),
		date: extractDate(text),
		transactionType: extractTransactionType(text),
		description: extractDescription(text),
	};
}
