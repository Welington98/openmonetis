"use client";

import { RiLink } from "@remixicon/react";
import { useState } from "react";
import type { BankConnectionOption } from "@/features/bank-sync/components/link-account-to-pluggy-dialog";
import { LinkAccountToPluggyDialog } from "@/features/bank-sync/components/link-account-to-pluggy-dialog";
import { Button } from "@/shared/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";

interface LinkAccountToPluggyButtonProps {
	financialAccountId: string;
	financialAccountName: string;
	currentConnectorName: string | null;
	connections: BankConnectionOption[];
}

/** Botão autocontido (com o próprio estado de abrir/fechar) pra usar em Server Components. */
export function LinkAccountToPluggyButton({
	financialAccountId,
	financialAccountName,
	currentConnectorName,
	connections,
}: LinkAccountToPluggyButtonProps) {
	const [open, setOpen] = useState(false);

	if (connections.length === 0) return null;

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className={
							currentConnectorName
								? "text-primary hover:text-primary"
								: "text-muted-foreground hover:text-foreground"
						}
						aria-label={
							currentConnectorName
								? `Vinculada ao Pluggy — ${currentConnectorName}`
								: "Vincular ao Pluggy"
						}
						onClick={() => setOpen(true)}
					>
						<RiLink className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{currentConnectorName
						? `Vinculada ao Pluggy — ${currentConnectorName}`
						: "Vincular ao Pluggy"}
				</TooltipContent>
			</Tooltip>
			<LinkAccountToPluggyDialog
				open={open}
				onOpenChange={setOpen}
				financialAccountId={financialAccountId}
				financialAccountName={financialAccountName}
				currentConnectorName={currentConnectorName}
				connections={connections}
			/>
		</>
	);
}
