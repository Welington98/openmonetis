import { RiAndroidLine, RiArrowRightSLine } from "@remixicon/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { DiarySettingsForm } from "@/features/diary/components/diary-settings-form";
import { fetchDiarySettings } from "@/features/diary/queries";
import { GoogleCalendarTab } from "@/features/google-calendar/components/google-calendar-tab";
import { isGoogleCalendarConfigured } from "@/features/google-calendar/lib/google-calendar-client";
import { fetchGoogleCalendarConnectionStatus } from "@/features/google-calendar/queries";
import { CompanionTab } from "@/features/settings/components/companion-tab";
import { DeleteAccountForm } from "@/features/settings/components/delete-account-form";
import { LinkedAccountsForm } from "@/features/settings/components/linked-accounts-form";
import { PasskeysForm } from "@/features/settings/components/passkeys-form";
import { PreferencesForm } from "@/features/settings/components/preferences-form";
import { UpdateEmailForm } from "@/features/settings/components/update-email-form";
import { UpdateNameForm } from "@/features/settings/components/update-name-form";
import { UpdatePasswordForm } from "@/features/settings/components/update-password-form";
import { fetchSettingsPageData } from "@/features/settings/queries";
import {
	getSingleParam,
	type ResolvedSearchParams,
} from "@/features/transactions/lib/page-helpers";
import { Card } from "@/shared/components/ui/card";
import { Separator } from "@/shared/components/ui/separator";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { auth } from "@/shared/lib/auth/config";

type PageProps = {
	searchParams?: Promise<ResolvedSearchParams>;
};

export default async function Page({ searchParams }: PageProps) {
	await connection();
	const session = await auth.api.getSession({
		headers: await headers(),
	});

	if (!session?.user) {
		redirect("/");
	}

	const userName = session.user.name || "";
	const userEmail = session.user.email || "";

	const resolvedParams = searchParams ? await searchParams : undefined;
	const googleCalendarParam = getSingleParam(resolvedParams, "googleCalendar");
	const linkedAccountParam = getSingleParam(resolvedParams, "contaVinculada");
	const defaultTab = googleCalendarParam
		? "google-agenda"
		: linkedAccountParam
			? "contas"
			: "preferencias";

	const [
		{ authProvider, userPreferences, userApiTokens },
		googleCalendarStatus,
		diarySettings,
	] = await Promise.all([
		fetchSettingsPageData(session.user.id),
		fetchGoogleCalendarConnectionStatus(session.user.id),
		fetchDiarySettings(session.user.id),
	]);

	return (
		<div className="w-full">
			<Tabs defaultValue={defaultTab} className="w-full">
				{/* No mobile: rolagem horizontal + seta indicando mais opções à direita */}
				<div className="relative -mx-6 px-6 md:mx-0 md:px-0">
					<div className="overflow-x-auto overflow-y-hidden scroll-smooth md:overflow-visible [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						<TabsList className="inline-flex w-max flex-nowrap md:w-full">
							<TabsTrigger value="preferencias">Preferências</TabsTrigger>
							<TabsTrigger value="diario">Diário</TabsTrigger>
							<TabsTrigger value="companion">Companion</TabsTrigger>
							<TabsTrigger value="google-agenda">Google Agenda</TabsTrigger>
							<TabsTrigger value="nome">Alterar nome</TabsTrigger>
							<TabsTrigger value="senha">Alterar senha</TabsTrigger>
							<TabsTrigger value="passkeys">Passkeys</TabsTrigger>
							<TabsTrigger value="contas">Contas vinculadas</TabsTrigger>
							<TabsTrigger value="email">Alterar e-mail</TabsTrigger>
							<TabsTrigger value="deletar" className="text-destructive">
								Ações perigosas
							</TabsTrigger>
						</TabsList>
					</div>
					<div
						className="pointer-events-none absolute right-0 top-0 hidden h-9 w-10 items-center justify-end bg-linear-to-l from-background to-transparent md:hidden"
						aria-hidden
					>
						<RiArrowRightSLine className="size-5 shrink-0 text-muted-foreground" />
					</div>
				</div>

				<TabsContent value="preferencias" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Preferências</h2>
								<p className="text-sm text-muted-foreground">
									Personalize sua experiência no OpenMonetis ajustando as
									configurações de acordo com suas necessidades.
								</p>
							</div>
							<Separator />
							<PreferencesForm
								statementNoteAsColumn={
									userPreferences?.statementNoteAsColumn ?? false
								}
								transactionsColumnOrder={
									userPreferences?.transactionsColumnOrder ?? null
								}
								attachmentMaxSizeMb={userPreferences?.attachmentMaxSizeMb ?? 50}
								showTransactionSummary={
									userPreferences?.showTransactionSummary ?? true
								}
								groupTransactionsByDate={
									userPreferences?.groupTransactionsByDate ?? true
								}
								hideAnticipatedInstallments={
									userPreferences?.hideAnticipatedInstallments ?? false
								}
								statementCategorizationMode={
									userPreferences?.statementCategorizationMode ?? "manual"
								}
							/>
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="diario" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Diário</h2>
								<p className="text-sm text-muted-foreground">
									Configure o lembrete e o orçamento diário do check-in
									financeiro.
								</p>
							</div>
							<Separator />
							<DiarySettingsForm
								reminderEnabled={diarySettings.reminderEnabled}
								reminderTime={diarySettings.reminderTime}
								dailyBudgetAmount={diarySettings.dailyBudgetAmount}
							/>
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="companion" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<div className="flex items-center gap-2 mb-1">
									<h2 className="text-xl font-semibold">
										OpenMonetis Companion
									</h2>
									<span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success dark:bg-success/10">
										<RiAndroidLine className="h-3 w-3" />
										Android
									</span>
								</div>
								<p className="text-sm text-muted-foreground">
									Capture notificações de transações dos seus apps de banco
									(Nubank, Itaú, Bradesco, Inter, C6 e outros) e envie para sua
									caixa de entrada.
								</p>
							</div>
							<Separator />
							<CompanionTab tokens={userApiTokens} />
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="google-agenda" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Google Agenda</h2>
								<p className="text-sm text-muted-foreground">
									Sincronize vencimentos e lançamentos do OpenMonetis com uma
									agenda dedicada no seu Google Agenda.
								</p>
							</div>
							<Separator />
							<GoogleCalendarTab
								configured={isGoogleCalendarConfigured()}
								isConnected={googleCalendarStatus.isConnected}
								lastSyncedAt={googleCalendarStatus.lastSyncedAt}
							/>
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="nome" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Alterar nome</h2>
								<p className="text-sm text-muted-foreground">
									Atualize como seu nome aparece no OpenMonetis. Esse nome pode
									ser exibido em diferentes seções do app e em comunicações.
								</p>
							</div>
							<Separator />
							<UpdateNameForm currentName={userName} />
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="senha" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Alterar senha</h2>
								<p className="text-sm text-muted-foreground">
									Defina uma nova senha para sua conta. Guarde-a em local
									seguro.
								</p>
							</div>
							<Separator />
							<UpdatePasswordForm authProvider={authProvider} />
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="passkeys" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Passkeys</h2>
								<p className="text-sm text-muted-foreground">
									Passkeys permitem login sem senha, usando biometria (Face ID,
									Touch ID, Windows Hello) ou chaves de segurança.
								</p>
							</div>
							<Separator />
							<PasskeysForm />
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="contas" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">
									Contas vinculadas
								</h2>
								<p className="text-sm text-muted-foreground">
									Vincule outras formas de login à sua conta, mantendo sua senha
									atual funcionando normalmente.
								</p>
							</div>
							<Separator />
							<LinkedAccountsForm
								googleConfigured={isGoogleCalendarConfigured()}
							/>
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="email" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Alterar e-mail</h2>
								<p className="text-sm text-muted-foreground">
									Atualize o e-mail associado à sua conta. Você precisará
									confirmar os links enviados para o novo e também para o e-mail
									atual (quando aplicável) para concluir a alteração.
								</p>
							</div>
							<Separator />
							<UpdateEmailForm
								currentEmail={userEmail}
								authProvider={authProvider}
							/>
						</div>
					</Card>
				</TabsContent>

				<TabsContent value="deletar" className="mt-4">
					<Card className="p-6">
						<div className="space-y-4">
							<div>
								<h2 className="text-xl font-semibold mb-1">Ações perigosas</h2>
								<p className="text-sm text-muted-foreground">
									Você pode zerar os dados do OpenMonetis e manter seu acesso,
									ou excluir sua conta inteira de forma irreversível.
								</p>
							</div>
							<DeleteAccountForm />
						</div>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
