"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import type { CostCenter } from "@/db/schema";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { updateCostCenterAction } from "@/shared/lib/cost-centers/actions";
import { COST_CENTER_KIND_DESCRIPTION } from "@/shared/lib/cost-centers/constants";

interface CostCentersDialogProps {
	costCenters: CostCenter[];
	trigger: React.ReactNode;
}

export function CostCentersDialog({
	costCenters,
	trigger,
}: CostCentersDialogProps) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [names, setNames] = useState<Record<string, string>>({});

	useEffect(() => {
		if (open) {
			setNames(Object.fromEntries(costCenters.map((cc) => [cc.id, cc.name])));
		}
	}, [open, costCenters]);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const changed = costCenters.filter(
			(cc) => names[cc.id]?.trim() && names[cc.id]?.trim() !== cc.name,
		);

		if (changed.length === 0) {
			setOpen(false);
			return;
		}

		startTransition(async () => {
			const results = await Promise.all(
				changed.map((cc) =>
					updateCostCenterAction({
						id: cc.id,
						name: names[cc.id]?.trim() ?? "",
					}),
				),
			);

			const failed = results.find((result) => !result.success);
			if (failed && !failed.success) {
				toast.error(failed.error);
				return;
			}

			toast.success("Centros de custo atualizados com sucesso.");
			setOpen(false);
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Centros de custo</DialogTitle>
					<DialogDescription>
						Renomeie os centros de custo que classificam seus lançamentos de
						despesa no orçamento diário.
					</DialogDescription>
				</DialogHeader>

				<form className="flex flex-col gap-5" onSubmit={handleSubmit}>
					{costCenters.map((costCenter) => (
						<div key={costCenter.id} className="flex flex-col gap-2">
							<Label htmlFor={`cost-center-${costCenter.id}`}>
								{
									COST_CENTER_KIND_DESCRIPTION[
										costCenter.kind as keyof typeof COST_CENTER_KIND_DESCRIPTION
									]
								}
							</Label>
							<Input
								id={`cost-center-${costCenter.id}`}
								value={names[costCenter.id] ?? ""}
								onChange={(event) =>
									setNames((prev) => ({
										...prev,
										[costCenter.id]: event.target.value,
									}))
								}
								required
							/>
						</div>
					))}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
