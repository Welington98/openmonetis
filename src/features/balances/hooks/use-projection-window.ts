"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useRef } from "react";
import {
	addMonthsToPeriod,
	formatPeriod,
	formatPeriodForUrl,
	parsePeriodParam,
} from "@/shared/utils/period";

const WINDOW_PARAM = "inicio";

/** Meses cobertos pela janela — mês inicial + 11 (bate com `MONTHS_IN_WINDOW` em `queries.ts`). */
export const MONTHS_IN_WINDOW = 12;

/**
 * Mesmo padrão de `use-month-period.ts` (URL simples via `useSearchParams`,
 * sem nuqs) — só um param, `inicio`; o fim é sempre derivado
 * (`inicio + 11 meses`), então a janela nunca fica inconsistente na URL.
 */
export function useProjectionWindow() {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const startFromParams = searchParams.get(WINDOW_PARAM);
	const referenceDate = useRef(new Date()).current;
	const defaultStartPeriod = formatPeriod(
		referenceDate.getFullYear(),
		referenceDate.getMonth() + 1,
	);
	const { period: startPeriod } = parsePeriodParam(
		startFromParams,
		referenceDate,
	);
	const endPeriod = addMonthsToPeriod(startPeriod, MONTHS_IN_WINDOW - 1);

	const buildHref = (targetStartPeriod: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set(WINDOW_PARAM, formatPeriodForUrl(targetStartPeriod));
		return `${pathname}?${params.toString()}`;
	};

	return {
		startPeriod,
		endPeriod,
		defaultStartPeriod,
		buildHref,
	};
}
