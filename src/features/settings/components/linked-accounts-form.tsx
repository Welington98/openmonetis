"use client";

import { RiAlertLine, RiGoogleFill, RiLoader4Line } from "@remixicon/react";
import { useCallback, useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { authClient } from "@/shared/lib/auth/client";

type LinkedAccountsFormProps = {
	googleConfigured: boolean;
};

export function LinkedAccountsForm({
	googleConfigured,
}: LinkedAccountsFormProps) {
	const [isGoogleLinked, setIsGoogleLinked] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isLinking, setIsLinking] = useState(false);
	const [isUnlinking, setIsUnlinking] = useState(false);
	const [confirmUnlink, setConfirmUnlink] = useState(false);

	const fetchAccounts = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const { data, error: fetchError } = await authClient.listAccounts();
			if (fetchError) {
				setError(
					(fetchError.message as string) ||
						"Erro ao carregar contas vinculadas.",
				);
				return;
			}
			setIsGoogleLinked(
				(data ?? []).some((account) => account.providerId === "google"),
			);
		} catch {
			setError("Erro ao carregar contas vinculadas.");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAccounts();
	}, [fetchAccounts]);

	const handleLink = async () => {
		setIsLinking(true);
		setError(null);
		try {
			const { error: linkError } = await authClient.linkSocial({
				provider: "google",
				callbackURL: "/settings?contaVinculada=1",
			});
			if (linkError) {
				setError(
					(linkError.message as string) || "Erro ao vincular conta Google.",
				);
				setIsLinking(false);
			}
			// Em caso de sucesso, o client redireciona pro consentimento do
			// Google — não há mais nada a fazer aqui.
		} catch {
			setError("Erro ao vincular conta Google.");
			setIsLinking(false);
		}
	};

	const handleUnlink = async () => {
		setIsUnlinking(true);
		setError(null);
		try {
			const { error: unlinkError } = await authClient.unlinkAccount({
				providerId: "google",
			});
			if (unlinkError) {
				setError(
					(unlinkError.message as string) ||
						"Erro ao desvincular conta Google.",
				);
				return;
			}
			setConfirmUnlink(false);
			await fetchAccounts();
		} catch {
			setError("Erro ao desvincular conta Google.");
		} finally {
			setIsUnlinking(false);
		}
	};

	return (
		<div className="space-y-4">
			<div>
				<h3 className="font-semibold">Login com Google</h3>
				<p className="text-sm text-muted-foreground">
					Vincule sua conta Google pra poder entrar também com um clique, sem
					precisar da senha.
				</p>
			</div>

			{error && (
				<div className="flex items-center gap-2 text-sm text-destructive">
					<RiAlertLine className="h-4 w-4 shrink-0" />
					{error}
				</div>
			)}

			{isLoading ? (
				<div className="flex items-center justify-center py-8">
					<RiLoader4Line className="h-5 w-5 animate-spin text-muted-foreground" />
				</div>
			) : (
				<div className="flex items-center justify-between rounded-md border p-4">
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
							<RiGoogleFill className="h-4 w-4" />
						</div>
						<div>
							<p className="text-sm font-medium">Google</p>
							<p className="text-xs text-muted-foreground">
								{isGoogleLinked
									? "Conta vinculada"
									: googleConfigured
										? "Não vinculada"
										: "Login com Google não está configurado neste servidor"}
							</p>
						</div>
					</div>

					{isGoogleLinked ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setConfirmUnlink(true)}
							disabled={isUnlinking}
						>
							Desvincular
						</Button>
					) : (
						<Button
							size="sm"
							onClick={handleLink}
							disabled={isLinking || !googleConfigured}
						>
							{isLinking ? (
								<>
									<RiLoader4Line className="h-4 w-4 animate-spin mr-1" />
									Redirecionando...
								</>
							) : (
								"Vincular"
							)}
						</Button>
					)}
				</div>
			)}

			<AlertDialog
				open={confirmUnlink}
				onOpenChange={(open) => !open && setConfirmUnlink(false)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Desvincular conta Google?</AlertDialogTitle>
						<AlertDialogDescription>
							Você não vai mais conseguir entrar com o Google. Se essa for sua
							única forma de login, a desvinculação será recusada.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isUnlinking}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleUnlink}
							disabled={isUnlinking}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{isUnlinking ? "Desvinculando..." : "Desvincular"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
