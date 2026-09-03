import { TabsList, TabsTrigger } from "@/shared/components/ui/tabs";

type PayablesTabsProps = {
	payableCount: number;
	receivableCount: number;
	isPending: boolean;
};

export function PayablesTabs({
	payableCount,
	receivableCount,
	isPending,
}: PayablesTabsProps) {
	return (
		<TabsList variant="stacked" className="grid-cols-2">
			<TabsTrigger
				value="pagar"
				variant="stacked"
				disabled={isPending}
				className="flex-col gap-0 px-1 text-sm leading-tight sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>A pagar</span>
				<span>({payableCount})</span>
			</TabsTrigger>
			<TabsTrigger
				value="receber"
				variant="stacked"
				disabled={isPending}
				className="flex-col gap-0 px-1 text-sm leading-tight sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>A receber</span>
				<span>({receivableCount})</span>
			</TabsTrigger>
		</TabsList>
	);
}
