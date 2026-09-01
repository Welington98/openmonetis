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
		<TabsList className="grid h-auto w-full grid-cols-2 sm:inline-flex sm:h-9 sm:grid-cols-none">
			<TabsTrigger
				value="pagar"
				disabled={isPending}
				className="h-11 min-w-0 flex-col gap-0 px-1 text-sm leading-tight sm:h-9 sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>A pagar</span>
				<span>({payableCount})</span>
			</TabsTrigger>
			<TabsTrigger
				value="receber"
				disabled={isPending}
				className="h-11 min-w-0 flex-col gap-0 px-1 text-sm leading-tight sm:h-9 sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>A receber</span>
				<span>({receivableCount})</span>
			</TabsTrigger>
		</TabsList>
	);
}
