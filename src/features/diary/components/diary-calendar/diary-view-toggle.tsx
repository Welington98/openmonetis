"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";

type DiaryViewToggleProps = {
	view: "month" | "week";
};

export function DiaryViewToggle({ view }: DiaryViewToggleProps) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const handleChange = (value: string) => {
		if (!value) return;
		const params = new URLSearchParams(searchParams.toString());
		params.set("view", value);
		router.replace(`${pathname}?${params.toString()}`, { scroll: false });
	};

	return (
		<ToggleGroup
			type="single"
			variant="outline"
			value={view}
			onValueChange={handleChange}
			className="w-fit"
		>
			<ToggleGroupItem value="month" aria-label="Ver por mês">
				Mês
			</ToggleGroupItem>
			<ToggleGroupItem value="week" aria-label="Ver por semana">
				Semana
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
