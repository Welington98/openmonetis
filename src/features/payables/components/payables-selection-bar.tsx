import MoneyValues from "@/shared/components/money-values";

type PayablesSelectionBarProps = {
	selectedCount: number;
	selectedTotal: number;
};

export function PayablesSelectionBar({
	selectedCount,
	selectedTotal,
}: PayablesSelectionBarProps) {
	if (selectedCount === 0) {
		return null;
	}

	return (
		<div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
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
	);
}
