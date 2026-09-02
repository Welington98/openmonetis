"use client";

import { RiNotification3Line, RiNotificationOffLine } from "@remixicon/react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	sendTestPushNotificationAction,
	subscribeToPushAction,
	unsubscribeFromPushAction,
} from "@/features/settings/actions/push-notifications-actions";
import { Button } from "@/shared/components/ui/button";

type SupportState = "checking" | "unsupported" | "supported";
type SubscriptionState = "unknown" | "subscribed" | "unsubscribed";

function base64ToUint8Array(base64: string) {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");

	const rawData = window.atob(normalized);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; i++) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

export function PushNotificationsForm() {
	const [support, setSupport] = useState<SupportState>("checking");
	const [subscriptionState, setSubscriptionState] =
		useState<SubscriptionState>("unknown");
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
			setSupport("unsupported");
			return;
		}
		setSupport("supported");

		navigator.serviceWorker.ready
			.then((registration) => registration.pushManager.getSubscription())
			.then((subscription) => {
				setSubscriptionState(subscription ? "subscribed" : "unsubscribed");
			})
			.catch(() => setSubscriptionState("unsubscribed"));
	}, []);

	const handleSubscribe = () => {
		const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
		if (!publicKey) {
			toast.error(
				"Notificações push não configuradas no servidor (chave VAPID ausente).",
			);
			return;
		}

		startTransition(async () => {
			try {
				const permission = await Notification.requestPermission();
				if (permission !== "granted") {
					toast.error("Permissão de notificações negada.");
					return;
				}

				const registration = await navigator.serviceWorker.ready;
				const subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: base64ToUint8Array(publicKey),
				});

				const result = await subscribeToPushAction(
					subscription.toJSON() as {
						endpoint: string;
						keys: { p256dh: string; auth: string };
					},
				);

				if (result.success) {
					setSubscriptionState("subscribed");
					toast.success(result.message);
				} else {
					toast.error(result.error);
				}
			} catch {
				toast.error("Não foi possível ativar as notificações push.");
			}
		});
	};

	const handleUnsubscribe = () => {
		startTransition(async () => {
			try {
				const registration = await navigator.serviceWorker.ready;
				const subscription = await registration.pushManager.getSubscription();

				if (!subscription) {
					setSubscriptionState("unsubscribed");
					return;
				}

				const endpoint = subscription.endpoint;
				await subscription.unsubscribe();
				const result = await unsubscribeFromPushAction({ endpoint });

				if (result.success) {
					setSubscriptionState("unsubscribed");
					toast.success(result.message);
				} else {
					toast.error(result.error);
				}
			} catch {
				toast.error("Não foi possível desativar as notificações push.");
			}
		});
	};

	const handleSendTest = () => {
		startTransition(async () => {
			const result = await sendTestPushNotificationAction();
			if (result.success) {
				toast.success(result.message);
			} else {
				toast.error(result.error);
			}
		});
	};

	if (support === "unsupported") {
		return (
			<p className="text-sm text-muted-foreground">
				Seu navegador não suporta notificações push. Tente um navegador mais
				recente (Chrome, Edge, Firefox ou Safari 16.4+).
			</p>
		);
	}

	const isSubscribed = subscriptionState === "subscribed";

	return (
		<div className="space-y-4 max-w-md">
			<div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
					{isSubscribed ? (
						<RiNotification3Line className="h-4 w-4 text-primary" />
					) : (
						<RiNotificationOffLine className="h-4 w-4" />
					)}
				</div>
				<div className="min-w-0 space-y-1">
					<p className="text-sm font-medium">
						{isSubscribed
							? "Notificações push ativadas"
							: "Notificações push desativadas"}
					</p>
					<p className="text-sm text-muted-foreground">
						Receba avisos de faturas e boletos vencendo e orçamentos estourados
						diretamente no seu dispositivo, mesmo com o app fechado.
					</p>
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				{isSubscribed ? (
					<Button
						type="button"
						variant="outline"
						disabled={isPending}
						onClick={handleUnsubscribe}
					>
						Desativar
					</Button>
				) : (
					<Button
						type="button"
						disabled={isPending || support === "checking"}
						onClick={handleSubscribe}
					>
						Ativar notificações push
					</Button>
				)}

				{isSubscribed && (
					<Button
						type="button"
						variant="ghost"
						disabled={isPending}
						onClick={handleSendTest}
					>
						Enviar notificação de teste
					</Button>
				)}
			</div>
		</div>
	);
}
