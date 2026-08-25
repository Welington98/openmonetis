/**
 * Extrai o texto de um PDF gerado digitalmente (comprovante de banco), não OCR.
 * Roda no client (mesmo padrão de `pdfjs-dist` já usado em
 * `attachment-grid-item.tsx`, com o worker copiado para /pdf.worker.min.mjs
 * pelo postinstall do pacote).
 */
export async function extractPdfText(file: File): Promise<string> {
	const pdfjsLib = await import("pdfjs-dist");
	pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

	const arrayBuffer = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

	const pageTexts: string[] = [];
	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		const pageText = content.items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ");
		pageTexts.push(pageText);
	}

	return pageTexts.join("\n");
}
