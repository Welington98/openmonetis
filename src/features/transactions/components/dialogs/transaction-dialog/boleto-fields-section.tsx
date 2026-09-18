"use client";

import { DatePicker } from "@/shared/components/ui/date-picker";
import { Label } from "@/shared/components/ui/label";
import type { BoletoFieldsSectionProps } from "./transaction-dialog-types";

export function BoletoFieldsSection({
	formState,
	onFieldChange,
}: BoletoFieldsSectionProps) {
	return (
		<div className="flex w-full flex-col gap-2 md:flex-row">
			<div className="space-y-1 w-full md:w-1/2">
				<Label htmlFor="dueDate">Vencimento do boleto</Label>
				<DatePicker
					id="dueDate"
					value={formState.dueDate}
					onChange={(value) => onFieldChange("dueDate", value)}
					placeholder="Selecione o vencimento"
				/>
			</div>
		</div>
	);
}
