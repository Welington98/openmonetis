"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import { getWeekStart } from "@/features/diary/lib/week";
import { getBusinessDateString } from "@/shared/utils/date";

const WEEK_PARAM = "semana";
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Espelha useMonthPeriod (src/shared/components/month-picker/use-month-period.ts)
 * mas pra semana — segunda-feira (YYYY-MM-DD) como identificador via o
 * search param "semana", em vez de "periodo" (YYYY-MM).
 */
export function useWeekPeriod() {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const weekParam = searchParams.get(WEEK_PARAM);
	const defaultWeekStart = useRef(
		getWeekStart(getBusinessDateString()),
	).current;

	const weekStart =
		weekParam && DATE_ONLY_REGEX.test(weekParam)
			? getWeekStart(weekParam)
			: defaultWeekStart;

	const buildHref = (targetWeekStart: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set(WEEK_PARAM, targetWeekStart);
		params.set("view", "week");
		return `${pathname}?${params.toString()}`;
	};

	return { weekStart, defaultWeekStart, buildHref };
}
