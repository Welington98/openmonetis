import {
	RiCheckboxCircleLine,
	RiDeleteBin5Line,
	RiFileCopyLine,
} from "@remixicon/react";
import MoneyValues from "@/shared/components/money-values";
import { Button } from "@/shared/components/ui/button";

type TransactionsBulkBarProps = {
	selectedCount: number;
	selectedTotal: number;
	mode: "delete" | "import" | "settle";
	onAction: () => void;
};

export function TransactionsBulkBar({
	selectedCount,
	selectedTotal,
	mode,
	onAction,
}: TransactionsBulkBarProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
			<div className="flex flex-col text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
				<span>
					{selectedCount}{" "}
					{selectedCount === 1 ? "item selecionado" : "itens selecionados"}
				</span>
				<span className="hidden sm:inline" aria-hidden>
					-
				</span>
				<span>
					Total:{" "}
					<MoneyValues
						amount={selectedTotal}
						className="inline font-medium text-foreground"
					/>
				</span>
			</div>
			{mode === "delete" ? (
				<Button
					onClick={onAction}
					variant="destructive"
					size="sm"
					className="ml-auto"
				>
					<RiDeleteBin5Line className="size-4" />
					Remover selecionados
				</Button>
			) : mode === "settle" ? (
				<Button
					onClick={onAction}
					variant="default"
					size="sm"
					className="ml-auto"
				>
					<RiCheckboxCircleLine className="size-4" />
					Agrupar e marcar como pago
				</Button>
			) : (
				<Button
					onClick={onAction}
					variant="default"
					size="sm"
					className="ml-auto"
				>
					<RiFileCopyLine className="size-4" />
					Importar selecionados
				</Button>
			)}
		</div>
	);
}
