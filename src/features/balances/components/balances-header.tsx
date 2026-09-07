"use client";

import {
	RiArrowLeftDoubleLine,
	RiArrowRightDoubleLine,
} from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useProjectionWindow } from "@/features/balances/hooks/use-projection-window";
import NavigationButton from "@/shared/components/month-picker/nav-button";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import {
	addMonthsToPeriod,
	formatCompactPeriodLabel,
} from "@/shared/utils/period";

export function BalancesHeader() {
	const { startPeriod, endPeriod, defaultStartPeriod, buildHref } =
		useProjectionWindow();
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const farBackTarget = buildHref(addMonthsToPeriod(startPeriod, -12));
	const backTarget = buildHref(addMonthsToPeriod(startPeriod, -1));
	const forwardTarget = buildHref(addMonthsToPeriod(startPeriod, 1));
	const farForwardTarget = buildHref(addMonthsToPeriod(startPeriod, 12));
	const returnTarget = buildHref(defaultStartPeriod);
	const isDifferentFromCurrent = startPeriod !== defaultStartPeriod;

	useEffect(() => {
		router.prefetch(backTarget);
		router.prefetch(forwardTarget);
	}, [router, backTarget, forwardTarget]);

	const navigate = (href: string) => {
		startTransition(() => {
			router.replace(href, { scroll: false });
		});
	};

	return (
		<Card className="sticky top-18 z-10 flex w-full flex-row items-center justify-between gap-2 px-3 py-3 backdrop-blur-md supports-backdrop-filter:bg-card/60 sm:px-4">
			<div className="flex min-w-0 items-center">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={isPending}
					onClick={() => navigate(farBackTarget)}
					aria-label="Voltar 12 meses"
				>
					<RiArrowLeftDoubleLine className="size-4 text-primary" />
				</Button>
				<NavigationButton
					direction="left"
					disabled={isPending}
					onClick={() => navigate(backTarget)}
				/>

				<span className="min-w-32 truncate px-1 text-center text-sm font-semibold capitalize">
					{formatCompactPeriodLabel(startPeriod)} –{" "}
					{formatCompactPeriodLabel(endPeriod)}
				</span>

				<NavigationButton
					direction="right"
					disabled={isPending}
					onClick={() => navigate(forwardTarget)}
				/>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					disabled={isPending}
					onClick={() => navigate(farForwardTarget)}
					aria-label="Avançar 12 meses"
				>
					<RiArrowRightDoubleLine className="size-4 text-primary" />
				</Button>
			</div>

			{isDifferentFromCurrent && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={isPending}
					onClick={() => navigate(returnTarget)}
				>
					hoje
				</Button>
			)}
		</Card>
	);
}
