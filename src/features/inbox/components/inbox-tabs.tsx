import { TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import type { InboxStatusCounts } from "./types";

type InboxTabsProps = {
	counts: InboxStatusCounts;
	isPending: boolean;
};

export function InboxTabs({ counts, isPending }: InboxTabsProps) {
	return (
		<TabsList variant="stacked" className="grid-cols-3">
			<TabsTrigger
				value="pending"
				variant="stacked"
				disabled={isPending}
				className="flex-col gap-0 px-1 text-sm leading-tight sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>Pendentes</span>
				<span>({counts.pending})</span>
			</TabsTrigger>
			<TabsTrigger
				value="processed"
				variant="stacked"
				disabled={isPending}
				className="flex-col gap-0 px-1 text-sm leading-tight sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>Processados</span>
				<span>({counts.processed})</span>
			</TabsTrigger>
			<TabsTrigger
				value="discarded"
				variant="stacked"
				disabled={isPending}
				className="flex-col gap-0 px-1 text-sm leading-tight sm:flex-row sm:gap-1 sm:px-4"
			>
				<span>Descartados</span>
				<span>({counts.discarded})</span>
			</TabsTrigger>
		</TabsList>
	);
}
