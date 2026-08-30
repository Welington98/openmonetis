"use client";

import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useWeekPeriod } from "@/features/diary/hooks/use-week-period";
import { addDays, addWeeks } from "@/features/diary/lib/week";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { formatDateOnly } from "@/shared/utils/date";

export function DiaryWeekNavigation() {
	const { weekStart, defaultWeekStart, buildHref } = useWeekPeriod();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const weekEnd = addDays(weekStart, 6);
	const prevTarget = buildHref(addWeeks(weekStart, -1));
	const nextTarget = buildHref(addWeeks(weekStart, 1));
	const returnTarget = buildHref(defaultWeekStart);
	const isDifferentFromCurrent = weekStart !== defaultWeekStart;

	useEffect(() => {
		router.prefetch(prevTarget);
		router.prefetch(nextTarget);
	}, [router, prevTarget, nextTarget]);

	const handleNavigate = (href: string) => {
		startTransition(() => {
			router.replace(href, { scroll: false });
		});
	};

	const label = `${formatDateOnly(weekStart, { day: "2-digit", month: "short" })} – ${formatDateOnly(
		weekEnd,
		{ day: "2-digit", month: "short", year: "numeric" },
	)}`;

	return (
		<Card className="flex w-full flex-row items-center justify-between gap-2 px-3 py-3">
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={isPending}
					onClick={() => handleNavigate(prevTarget)}
					aria-label="Semana anterior"
				>
					<RiArrowLeftSLine />
				</Button>
				<span className="text-sm font-semibold">{label}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={isPending}
					onClick={() => handleNavigate(nextTarget)}
					aria-label="Próxima semana"
				>
					<RiArrowRightSLine />
				</Button>
			</div>

			{isDifferentFromCurrent && (
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={() => handleNavigate(returnTarget)}
				>
					Esta semana
				</Button>
			)}
		</Card>
	);
}
