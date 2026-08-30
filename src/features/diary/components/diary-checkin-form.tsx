"use client";

import confetti from "canvas-confetti";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { saveTodayEntryAction } from "@/features/diary/actions";
import { useDiaryCheckinForm } from "@/features/diary/hooks/use-diary-checkin-form";
import {
	DIARY_CATEGORIES,
	DIARY_CLASSIFICATIONS,
	type DiaryCategory,
	type DiaryClassification,
} from "@/features/diary/lib/constants";
import type { DiaryEntryData } from "@/features/diary/queries";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";

const CONFETTI_COLORS = ["#e07a3a", "#f5a870", "#ffd4a8", "#b85520", "#8a3a10"];

function celebrateNewBadge() {
	confetti({
		particleCount: 90,
		spread: 75,
		origin: { x: 0.5, y: 0.4 },
		colors: CONFETTI_COLORS,
		startVelocity: 28,
		gravity: 1.1,
		scalar: 0.9,
		ticks: 200,
	});
}

type DiaryCheckinFormProps = {
	existingEntry?: DiaryEntryData | null;
};

export function DiaryCheckinForm({ existingEntry }: DiaryCheckinFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const { formState, updateField } = useDiaryCheckinForm(
		existingEntry
			? {
					hadExpense: existingEntry.hadExpense,
					amount:
						existingEntry.amount !== null ? String(existingEntry.amount) : "",
					category: existingEntry.category as DiaryCategory | null,
					classification:
						existingEntry.classification as DiaryClassification | null,
					note: existingEntry.note ?? "",
				}
			: undefined,
	);

	const canSubmit = formState.hadExpense !== null;

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (formState.hadExpense === null) {
			toast.error("Informe se houve gasto hoje.");
			return;
		}

		startTransition(async () => {
			const result = await saveTodayEntryAction({
				hadExpense: formState.hadExpense as boolean,
				amount: formState.hadExpense
					? formState.amount || undefined
					: undefined,
				category: formState.hadExpense ? formState.category : null,
				classification: formState.hadExpense ? formState.classification : null,
				note: formState.note || null,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(result.message);

			if (result.data && result.data.newlyEarnedBadges.length > 0) {
				celebrateNewBadge();
			}

			router.refresh();
		});
	};

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<div className="space-y-3">
				<Label className="text-base font-semibold">Houve gasto hoje?</Label>
				<div className="grid grid-cols-2 gap-3">
					<Button
						type="button"
						variant={formState.hadExpense === true ? "default" : "outline"}
						size="lg"
						className="h-16 text-base"
						onClick={() => updateField("hadExpense", true)}
					>
						Sim
					</Button>
					<Button
						type="button"
						variant={formState.hadExpense === false ? "default" : "outline"}
						size="lg"
						className="h-16 text-base"
						onClick={() => {
							updateField("hadExpense", false);
							updateField("amount", "");
							updateField("category", null);
							updateField("classification", null);
						}}
					>
						Não
					</Button>
				</div>
			</div>

			{formState.hadExpense === true && (
				<>
					<div className="space-y-2">
						<Label htmlFor="diary-amount">Quanto você gastou?</Label>
						<CurrencyInput
							id="diary-amount"
							value={formState.amount}
							onValueChange={(value) => updateField("amount", value)}
							placeholder="R$ 0,00"
							className="h-12 text-lg"
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<Label className="text-sm text-muted-foreground">
							Categoria (opcional)
						</Label>
						<ToggleGroup
							type="single"
							variant="outline"
							value={formState.category ?? ""}
							onValueChange={(value) =>
								updateField(
									"category",
									value ? (value as typeof formState.category) : null,
								)
							}
							className="flex flex-wrap justify-start gap-2"
						>
							{DIARY_CATEGORIES.map((category) => (
								<ToggleGroupItem
									key={category.value}
									value={category.value}
									aria-label={category.label}
									className="min-w-0 flex-none rounded-md! border px-3"
								>
									{category.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>

					<div className="space-y-2">
						<Label className="text-sm text-muted-foreground">
							Como você classifica esse gasto? (opcional)
						</Label>
						<ToggleGroup
							type="single"
							variant="outline"
							value={formState.classification ?? ""}
							onValueChange={(value) =>
								updateField(
									"classification",
									value ? (value as typeof formState.classification) : null,
								)
							}
							className="flex flex-wrap justify-start gap-2"
						>
							{DIARY_CLASSIFICATIONS.map((classification) => (
								<ToggleGroupItem
									key={classification.value}
									value={classification.value}
									aria-label={classification.label}
									className="min-w-0 flex-none rounded-md! border px-3"
								>
									{classification.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>
				</>
			)}

			<div className="space-y-2">
				<Label htmlFor="diary-note" className="text-sm text-muted-foreground">
					Nota (opcional)
				</Label>
				<Input
					id="diary-note"
					value={formState.note}
					onChange={(event) => updateField("note", event.target.value)}
					placeholder="Algo rápido sobre o seu dia..."
					maxLength={140}
				/>
			</div>

			<Button
				type="submit"
				size="lg"
				className="h-12 w-full text-base"
				disabled={!canSubmit || isPending}
			>
				{isPending ? "Salvando..." : "Salvar check-in"}
			</Button>
		</form>
	);
}
