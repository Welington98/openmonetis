"use client";

import {
	RiAddLine,
	RiArrowLeftRightLine,
	RiArrowRightDownLine,
	RiArrowRightUpLine,
	RiSplitCellsHorizontal,
} from "@remixicon/react";
import Link from "next/link";
import { useState } from "react";
import type { SelectOption } from "@/features/transactions/components/types";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/utils/ui";
import { CreateDetailedTransactionDialog } from "../dialogs/create-detailed-transaction-dialog";
import { TransactionDialog } from "../dialogs/transaction-dialog/transaction-dialog";

interface MobileAddFabProps {
	payerOptions: SelectOption[];
	splitPayerOptions: SelectOption[];
	defaultPayerId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	categoryOptions: SelectOption[];
	costCenterOptions: SelectOption[];
	estabelecimentos: string[];
	defaultPeriod: string;
	defaultAccountId?: string | null;
	defaultCardId?: string | null;
	defaultPaymentMethod?: string | null;
	lockCardSelection?: boolean;
	lockPaymentMethod?: boolean;
	attachmentMaxSizeMb?: number;
	/** "right" (padrão, canto inferior direito) ou "center" (centralizado horizontalmente, ex: telas sem lista/rolagem embaixo). */
	position?: "right" | "center";
}

const POSITION_CLASS: Record<"right" | "center", string> = {
	right: "right-4",
	center: "left-1/2 -translate-x-1/2",
};

export function MobileAddFab({
	payerOptions,
	splitPayerOptions,
	defaultPayerId,
	accountOptions,
	cardOptions,
	categoryOptions,
	costCenterOptions,
	estabelecimentos,
	defaultPeriod,
	defaultAccountId,
	defaultCardId,
	defaultPaymentMethod,
	lockCardSelection,
	lockPaymentMethod,
	attachmentMaxSizeMb,
	position = "right",
}: MobileAddFabProps) {
	const [dialogType, setDialogType] = useState<"Despesa" | "Receita" | null>(
		null,
	);
	const [detailedOpen, setDetailedOpen] = useState(false);

	return (
		<>
			<div
				className={cn(
					"fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 md:hidden",
					POSITION_CLASS[position],
				)}
			>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							size="icon"
							className="size-14 rounded-full shadow-lg"
							aria-label="Adicionar lançamento"
						>
							<RiAddLine className="size-6" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align={position === "center" ? "center" : "end"}
						side="top"
						className="w-56"
					>
						<DropdownMenuItem onSelect={() => setDialogType("Receita")}>
							<RiArrowRightDownLine className="size-4 text-success" />
							Nova receita
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setDialogType("Despesa")}>
							<RiArrowRightUpLine className="size-4 text-destructive" />
							Nova despesa
						</DropdownMenuItem>
						<DropdownMenuItem asChild>
							<Link href="/accounts">
								<RiArrowLeftRightLine className="size-4 text-info" />
								Transferência entre contas
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => setDetailedOpen(true)}>
							<RiSplitCellsHorizontal className="size-4 text-muted-foreground" />
							Lançamento detalhado
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<CreateDetailedTransactionDialog
				open={detailedOpen}
				onOpenChange={setDetailedOpen}
				accountOptions={accountOptions}
				payerOptions={payerOptions}
				categoryOptions={categoryOptions}
				costCenterOptions={costCenterOptions}
			/>

			<TransactionDialog
				mode="create"
				open={dialogType !== null}
				onOpenChange={(open) => {
					if (!open) setDialogType(null);
				}}
				payerOptions={payerOptions}
				splitPayerOptions={splitPayerOptions}
				defaultPayerId={defaultPayerId}
				accountOptions={accountOptions}
				cardOptions={cardOptions}
				categoryOptions={categoryOptions}
				costCenterOptions={costCenterOptions}
				estabelecimentos={estabelecimentos}
				defaultPeriod={defaultPeriod}
				defaultAccountId={defaultAccountId}
				defaultCardId={defaultCardId}
				defaultPaymentMethod={defaultPaymentMethod}
				lockCardSelection={lockCardSelection}
				lockPaymentMethod={lockPaymentMethod}
				defaultTransactionType={dialogType ?? "Despesa"}
				maxSizeMb={attachmentMaxSizeMb}
			/>
		</>
	);
}
