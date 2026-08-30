"use client";

import { RiGoogleFill } from "@remixicon/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	toggleCardCalendarSyncAction,
	toggleTransactionCalendarSyncAction,
} from "@/features/google-calendar/actions";
import { Switch } from "@/shared/components/ui/switch";

type CalendarSyncToggleProps = {
	entity: "transaction" | "card";
	entityId: string;
	initialEnabled: boolean;
};

/** Switch compacto "aparece no Google Agenda" usado nos eventos do calendário financeiro. */
export function CalendarSyncToggle({
	entity,
	entityId,
	initialEnabled,
}: CalendarSyncToggleProps) {
	const [enabled, setEnabled] = useState(initialEnabled);
	const [isPending, startTransition] = useTransition();

	const handleChange = (checked: boolean) => {
		setEnabled(checked);
		startTransition(async () => {
			const result =
				entity === "transaction"
					? await toggleTransactionCalendarSyncAction({
							transactionId: entityId,
							enabled: checked,
						})
					: await toggleCardCalendarSyncAction({
							cardId: entityId,
							enabled: checked,
						});

			if (!result.success) {
				setEnabled(!checked);
				toast.error(result.error);
			}
		});
	};

	return (
		<div
			className="flex items-center gap-1.5"
			title={
				enabled ? "Aparece no Google Agenda" : "Não aparece no Google Agenda"
			}
		>
			<RiGoogleFill className="size-3.5 text-muted-foreground" />
			<Switch
				checked={enabled}
				onCheckedChange={handleChange}
				disabled={isPending}
				className="scale-75"
			/>
		</div>
	);
}
