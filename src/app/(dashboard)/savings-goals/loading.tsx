import { Skeleton } from "@/shared/components/ui/skeleton";

export default function SavingsGoalsLoading() {
	return (
		<main className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<Skeleton className="h-10 w-40 rounded-md bg-foreground/10" />
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="space-y-4 rounded-md border p-6">
						<div className="space-y-2">
							<Skeleton className="h-5 w-32 rounded-md bg-foreground/10" />
							<Skeleton className="h-4 w-24 rounded-md bg-foreground/10" />
						</div>

						<div className="space-y-2 border-t pt-4">
							<Skeleton className="h-4 w-24 rounded-md bg-foreground/10" />
							<Skeleton className="h-7 w-32 rounded-md bg-foreground/10" />
						</div>

						<div className="space-y-2">
							<Skeleton className="h-2 w-full rounded-full bg-foreground/10" />
							<Skeleton className="h-3 w-16 rounded-md bg-foreground/10" />
						</div>

						<div className="flex gap-2 pt-2">
							<Skeleton className="h-9 flex-1 rounded-md bg-foreground/10" />
							<Skeleton className="h-9 w-9 rounded-md bg-foreground/10" />
						</div>
					</div>
				))}
			</div>
		</main>
	);
}
