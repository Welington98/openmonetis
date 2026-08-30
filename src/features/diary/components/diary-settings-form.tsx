"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateDiarySettingsAction } from "@/features/diary/actions";
import {
	DIARY_REMINDER_TIME_PRESETS,
	DIARY_REMINDER_TIME_REGEX,
} from "@/features/diary/lib/constants";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";

type DiarySettingsFormProps = {
	reminderEnabled: boolean;
	reminderTime: string;
};

export function DiarySettingsForm({
	reminderEnabled: initialReminderEnabled,
	reminderTime: initialReminderTime,
}: DiarySettingsFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [reminderEnabled, setReminderEnabled] = useState(
		initialReminderEnabled,
	);
	const [reminderTime, setReminderTime] = useState(initialReminderTime);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!DIARY_REMINDER_TIME_REGEX.test(reminderTime)) {
			toast.error("Horário inválido. Use o formato HH:mm.");
			return;
		}

		startTransition(async () => {
			const result = await updateDiarySettingsAction({
				reminderEnabled,
				reminderTime,
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<section className="flex items-center justify-between max-w-md gap-4">
				<div className="space-y-2">
					<Label htmlFor="diary-reminder-enabled" className="text-sm">
						Lembrete diário
					</Label>
					<p className="text-sm text-muted-foreground">
						Mostra um aviso no app se você ainda não fez o check-in de hoje
						depois do horário escolhido.
					</p>
				</div>
				<Switch
					id="diary-reminder-enabled"
					checked={reminderEnabled}
					onCheckedChange={setReminderEnabled}
					disabled={isPending}
				/>
			</section>

			{reminderEnabled && (
				<section className="space-y-2 max-w-md">
					<Label className="text-sm">Horário do lembrete</Label>
					<ToggleGroup
						type="single"
						variant="outline"
						value={
							DIARY_REMINDER_TIME_PRESETS.includes(reminderTime)
								? reminderTime
								: ""
						}
						onValueChange={(value) => {
							if (value) setReminderTime(value);
						}}
						className="flex flex-wrap justify-start gap-2"
					>
						{DIARY_REMINDER_TIME_PRESETS.map((preset) => (
							<ToggleGroupItem key={preset} value={preset} aria-label={preset}>
								{preset}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</section>
			)}

			<div className="flex justify-end">
				<Button type="submit" disabled={isPending} className="w-fit">
					{isPending ? "Salvando..." : "Salvar configurações"}
				</Button>
			</div>
		</form>
	);
}
