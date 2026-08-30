"use client";

import { Card } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/ui";

export const DIARY_STATUS_STYLES: Record<
	"green" | "yellow" | "red" | "gray",
	{ dot: string; label: string }
> = {
	green: { dot: "bg-success", label: "Dentro do esperado" },
	yellow: { dot: "bg-amber-500", label: "Acima da média" },
	red: { dot: "bg-destructive", label: "Estourou o orçamento" },
	gray: { dot: "bg-muted-foreground/40", label: "Sem check-in" },
};

export function DiaryCalendarLegend() {
	return (
		<Card className="px-4 py-2">
			<ul className="flex flex-wrap items-center gap-2">
				{Object.entries(DIARY_STATUS_STYLES).map(([status, style]) => (
					<li
						key={status}
						className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground"
					>
						<span
							className={cn("size-2 shrink-0 rounded-full", style.dot)}
							aria-hidden
						/>
						{style.label}
					</li>
				))}
			</ul>
		</Card>
	);
}
