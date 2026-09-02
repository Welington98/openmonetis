import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
	interface WorkerGlobalScope extends SerwistGlobalConfig {
		__SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
	}
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
	precacheEntries: self.__SW_MANIFEST,
	skipWaiting: true,
	clientsClaim: true,
	navigationPreload: true,
	runtimeCaching: defaultCache,
});

serwist.addEventListeners();

type PushNotificationPayload = {
	title: string;
	body?: string;
	url?: string;
	icon?: string;
	tag?: string;
};

const DEFAULT_NOTIFICATION_ICON = "/images/web-app-manifest-192x192.png";

self.addEventListener("push", (event: PushEvent) => {
	if (!event.data) {
		return;
	}

	let payload: PushNotificationPayload;
	try {
		payload = event.data.json();
	} catch {
		payload = { body: event.data.text(), title: "OpenMonetis" };
	}

	if (!payload.title) {
		return;
	}

	event.waitUntil(
		self.registration.showNotification(payload.title, {
			body: payload.body,
			icon: payload.icon ?? DEFAULT_NOTIFICATION_ICON,
			badge: DEFAULT_NOTIFICATION_ICON,
			tag: payload.tag,
			data: { url: payload.url ?? "/" },
		}),
	);
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
	event.notification.close();
	const targetUrl = (event.notification.data?.url as string) ?? "/";

	event.waitUntil(
		self.clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((clientsList) => {
				const targetPath = new URL(targetUrl, self.location.origin).pathname;
				const existingClient = clientsList.find(
					(client) => new URL(client.url).pathname === targetPath,
				);

				if (existingClient && "focus" in existingClient) {
					return existingClient.focus();
				}

				return self.clients.openWindow(targetUrl);
			}),
	);
});
