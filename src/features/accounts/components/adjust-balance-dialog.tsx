"use client";

import { RiEqualizerLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { adjustAccountBalanceAction } from "@/features/accounts/actions";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { formatCurrency } from "@/shared/utils/currency";

type AdjustBalanceDialogProps = {
	accountId: string;
	period: string;
	currentBalance: number;
};

export function AdjustBalanceDialog({
	accountId,
	period,
	currentBalance,
}: AdjustBalanceDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [amount, setAmount] = useState<string>(
		Math.abs(currentBalance).toFixed(2),
	);
	const [sign, setSign] = useState<"credor" | "devedor">(
		currentBalance < 0 ? "devedor" : "credor",
	);

	useEffect(() => {
		if (open) {
			setAmount(Math.abs(currentBalance).toFixed(2));
			setSign(currentBalance < 0 ? "devedor" : "credor");
		}
	}, [open, currentBalance]);

	const amountMagnitude = Number(amount);
	const targetBalance = Number.isFinite(amountMagnitude)
		? sign === "devedor"
			? -Math.abs(amountMagnitude)
			: Math.abs(amountMagnitude)
		: Number.NaN;
	const diff = Number.isFinite(targetBalance)
		? Math.round((targetBalance - currentBalance) * 100) / 100
		: 0;
	const diffLabel =
		diff > 0
			? `Será criado um lançamento de receita de ${formatCurrency(diff)}.`
			: diff < 0
				? `Será criado um lançamento de despesa de ${formatCurrency(Math.abs(diff))}.`
				: "Nenhum ajuste será criado — o saldo já está correto.";

	const handleSave = () => {
		if (!Number.isFinite(targetBalance)) {
			toast.error("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await adjustAccountBalanceAction({
				accountId,
				period,
				currentBalance,
				targetBalance,
			});

			if (result.success) {
				toast.success(result.message);
				setOpen(false);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="text-primary hover:text-primary"
							aria-label="Ajustar saldo"
						>
							<RiEqualizerLine className="size-4" />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Ajustar saldo</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Ajustar saldo</DialogTitle>
					<DialogDescription>
						Informe o saldo correto da conta ao final do período. A diferença em
						relação ao saldo atual será lançada como um ajuste.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
						<p className="text-muted-foreground">Saldo atual no sistema</p>
						<p className="font-medium text-foreground">
							{formatCurrency(currentBalance)}
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="adjust-balance-target">Saldo correto</Label>
						<CurrencyInput
							id="adjust-balance-target"
							value={amount}
							onValueChange={setAmount}
							autoFocus
						/>
						<RadioGroup
							value={sign}
							onValueChange={(value) => setSign(value as "credor" | "devedor")}
							className="flex items-center gap-6"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="credor" id="adjust-balance-credor" />
								<Label
									htmlFor="adjust-balance-credor"
									className="cursor-pointer font-normal"
								>
									Credor
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="devedor" id="adjust-balance-devedor" />
								<Label
									htmlFor="adjust-balance-devedor"
									className="cursor-pointer font-normal"
								>
									Devedor
								</Label>
							</div>
						</RadioGroup>
						<p className="text-xs text-muted-foreground">{diffLabel}</p>
					</div>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleSave} disabled={isPending}>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
