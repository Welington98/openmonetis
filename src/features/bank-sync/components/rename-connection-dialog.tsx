"use client";

import { RiPencilLine } from "@remixicon/react";
import { useState } from "react";
import { toast } from "sonner";
import { renameBankConnectionAction } from "@/features/bank-sync/actions";
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

interface RenameConnectionDialogProps {
	connectionId: string;
	currentName: string;
	currentNickname: string | null;
}

export function RenameConnectionDialog({
	connectionId,
	currentName,
	currentNickname,
}: RenameConnectionDialogProps) {
	const [open, setOpen] = useState(false);
	const [nickname, setNickname] = useState(currentNickname ?? "");
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = async () => {
		setIsSaving(true);
		try {
			const result = await renameBankConnectionAction({
				connectionId,
				nickname: nickname.trim() || null,
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setOpen(false);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="icon-sm" aria-label="Renomear conexão">
					<RiPencilLine className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Renomear conexão</DialogTitle>
					<DialogDescription>
						Nome oficial do Pluggy: "{currentName}". Defina um apelido pra
						diferenciar contas do mesmo banco ou dar um nome mais claro — o nome
						oficial nunca é sobrescrito, você pode limpar o apelido a qualquer
						momento.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-1.5">
					<Label htmlFor="connection-nickname">Apelido</Label>
					<Input
						id="connection-nickname"
						value={nickname}
						onChange={(e) => setNickname(e.target.value)}
						placeholder={currentName}
						maxLength={60}
					/>
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={() => setOpen(false)}>
						Cancelar
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
