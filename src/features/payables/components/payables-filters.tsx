"use client";

import { RiFilterLine } from "@remixicon/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SETTLEABLE_PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Separator } from "@/shared/components/ui/separator";
import type { PayableFilterOption } from "../types";

export const PAYABLES_STATUS_OPTIONS: PayableFilterOption[] = [
	{ value: "atrasado", label: "Atrasado" },
	{ value: "agendado", label: "Agendado" },
];

const PAYMENT_FILTER_OPTIONS: PayableFilterOption[] =
	SETTLEABLE_PAYMENT_METHODS.map((method) => ({
		value: method,
		label: method,
	}));

export const CATEGORY_FILTER_PARAM = "categoria";
export const PAYMENT_FILTER_PARAM = "pagamento";
export const PAYER_FILTER_PARAM = "pessoa";
export const STATUS_FILTER_PARAM = "status";

const FILTER_PARAMS = [
	CATEGORY_FILTER_PARAM,
	PAYMENT_FILTER_PARAM,
	PAYER_FILTER_PARAM,
	STATUS_FILTER_PARAM,
];

function FilterSection({
	title,
	options,
	selected,
	onToggle,
}: {
	title: string;
	options: PayableFilterOption[];
	selected: string[];
	onToggle: (value: string) => void;
}) {
	if (options.length === 0) {
		return null;
	}

	return (
		<div className="space-y-1.5">
			<p className="text-xs font-medium text-muted-foreground">{title}</p>
			<div className="max-h-36 space-y-0.5 overflow-y-auto">
				{options.map((option) => (
					<label
						key={option.value}
						className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted/50"
					>
						<Checkbox
							checked={selected.includes(option.value)}
							onCheckedChange={() => onToggle(option.value)}
						/>
						<span className="truncate">{option.label}</span>
					</label>
				))}
			</div>
		</div>
	);
}

type PayablesFiltersProps = {
	categoryOptions: PayableFilterOption[];
	payerOptions: PayableFilterOption[];
	isPending: boolean;
};

export function PayablesFilters({
	categoryOptions,
	payerOptions,
	isPending,
}: PayablesFiltersProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const getValues = (key: string) => searchParams.getAll(key);

	const navigate = useCallback(
		(nextParams: URLSearchParams) => {
			const target = nextParams.toString()
				? `${pathname}?${nextParams.toString()}`
				: pathname;
			router.replace(target, { scroll: false });
		},
		[pathname, router],
	);

	const toggleValue = useCallback(
		(key: string, value: string) => {
			const nextParams = new URLSearchParams(searchParams.toString());
			const current = nextParams.getAll(key);
			nextParams.delete(key);
			const next = current.includes(value)
				? current.filter((v) => v !== value)
				: [...current, value];
			for (const v of next) {
				nextParams.append(key, v);
			}
			navigate(nextParams);
		},
		[searchParams, navigate],
	);

	const clearAll = useCallback(() => {
		const nextParams = new URLSearchParams(searchParams.toString());
		for (const key of FILTER_PARAMS) {
			nextParams.delete(key);
		}
		navigate(nextParams);
	}, [searchParams, navigate]);

	const categoryValues = getValues(CATEGORY_FILTER_PARAM);
	const paymentValues = getValues(PAYMENT_FILTER_PARAM);
	const payerValues = getValues(PAYER_FILTER_PARAM);
	const statusValues = getValues(STATUS_FILTER_PARAM);

	const activeCount =
		categoryValues.length +
		paymentValues.length +
		payerValues.length +
		statusValues.length;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className="relative gap-2"
					disabled={isPending}
				>
					<RiFilterLine className="size-4" aria-hidden />
					Filtrar
					{activeCount > 0 ? (
						<span className="-top-1.5 -right-1.5 absolute flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
							{activeCount}
						</span>
					) : null}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 space-y-3">
				<FilterSection
					title="Categoria"
					options={categoryOptions}
					selected={categoryValues}
					onToggle={(value) => toggleValue(CATEGORY_FILTER_PARAM, value)}
				/>
				<Separator />
				<FilterSection
					title="Forma de pagamento"
					options={PAYMENT_FILTER_OPTIONS}
					selected={paymentValues}
					onToggle={(value) => toggleValue(PAYMENT_FILTER_PARAM, value)}
				/>
				<Separator />
				<FilterSection
					title="Pessoa"
					options={payerOptions}
					selected={payerValues}
					onToggle={(value) => toggleValue(PAYER_FILTER_PARAM, value)}
				/>
				<Separator />
				<FilterSection
					title="Status"
					options={PAYABLES_STATUS_OPTIONS}
					selected={statusValues}
					onToggle={(value) => toggleValue(STATUS_FILTER_PARAM, value)}
				/>
				{activeCount > 0 ? (
					<Button
						variant="ghost"
						size="sm"
						className="w-full text-muted-foreground"
						onClick={clearAll}
					>
						Limpar filtros
					</Button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
