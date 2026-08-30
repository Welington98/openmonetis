import { Skeleton } from "@/shared/components/ui/skeleton";

export default function DiaryLoading() {
	return (
		<main className="mx-auto flex w-full max-w-lg flex-col gap-6">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<Skeleton className="h-6 w-40 rounded-md bg-foreground/10" />
					<Skeleton className="h-4 w-56 rounded-md bg-foreground/10" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="size-9 rounded-md bg-foreground/10" />
					<Skeleton className="size-9 rounded-md bg-foreground/10" />
				</div>
			</div>

			<Skeleton className="h-24 w-full rounded-lg bg-foreground/10" />

			<div className="rounded-lg border p-5 space-y-4">
				<Skeleton className="h-5 w-32 rounded-md bg-foreground/10" />
				<div className="grid grid-cols-2 gap-3">
					<Skeleton className="h-16 w-full rounded-md bg-foreground/10" />
					<Skeleton className="h-16 w-full rounded-md bg-foreground/10" />
				</div>
				<Skeleton className="h-12 w-full rounded-md bg-foreground/10" />
			</div>
		</main>
	);
}
