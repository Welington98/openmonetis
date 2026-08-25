"use client";

import { RiFilePdf2Line, RiUploadCloud2Line } from "@remixicon/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	createReceiptInboxItemAction,
	getReceiptUploadUrlAction,
} from "@/features/inbox/actions";
import { extractPdfText } from "@/features/inbox/lib/extract-pdf-text";
import { parseReceiptText } from "@/features/inbox/lib/receipt-parsing";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";

interface ReceiptUploadDialogProps {
	onUploaded?: () => void;
}

export function ReceiptUploadDialog({ onUploaded }: ReceiptUploadDialogProps) {
	const [open, setOpen] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	async function handleFile(file: File) {
		if (file.type !== "application/pdf") {
			toast.error("Envie um arquivo PDF.");
			return;
		}

		setIsUploading(true);
		try {
			const text = await extractPdfText(file);
			const parsed = parseReceiptText(text);

			const presign = await getReceiptUploadUrlAction({
				fileName: file.name,
				fileSize: file.size,
			});
			if (!presign.success) {
				toast.error(presign.error);
				return;
			}

			await fetch(presign.presignedUrl, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": "application/pdf" },
			});

			const result = await createReceiptInboxItemAction({
				fileKey: presign.fileKey,
				fileName: file.name,
				fileSize: file.size,
				originalText: text.slice(0, 5000),
				parsedName: parsed.description ?? undefined,
				parsedAmount: parsed.amount ?? undefined,
				parsedDate: parsed.date ?? undefined,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			setOpen(false);
			onUploaded?.();
		} catch (error) {
			console.error("[receipt-upload] falha ao processar comprovante", error);
			toast.error("Não foi possível processar o comprovante.");
		} finally {
			setIsUploading(false);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const selected = event.target.files?.[0];
		if (!selected) return;
		void handleFile(selected);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<RiUploadCloud2Line className="size-4" />
					Enviar comprovante
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Enviar comprovante</DialogTitle>
					<DialogDescription>
						Envie o PDF de um comprovante de Pix ou transferência. O texto é
						extraído automaticamente e você revisa os dados antes de criar o
						lançamento.
					</DialogDescription>
				</DialogHeader>

				<input
					ref={inputRef}
					type="file"
					accept="application/pdf"
					className="hidden"
					onChange={handleFileChange}
				/>

				<button
					type="button"
					disabled={isUploading}
					className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
					onClick={() => inputRef.current?.click()}
				>
					<RiFilePdf2Line className="size-6" />
					<span>{isUploading ? "Processando..." : "Selecionar PDF"}</span>
				</button>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => setOpen(false)}
						disabled={isUploading}
					>
						Cancelar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
