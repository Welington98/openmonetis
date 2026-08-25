import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function Loading() {
	return (
		<main className="flex flex-col gap-4">
			<div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
				{[1, 2, 3].map((i) => (
					<Card key={i}>
						<CardContent className="p-4">
							<Skeleton className="h-3 w-16 mb-1" />
							<Skeleton className="h-6 w-24" />
						</CardContent>
					</Card>
				))}
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				{[1, 2].map((i) => (
					<Card key={i}>
						<CardHeader className="pb-3">
							<Skeleton className="h-5 w-20" />
						</CardHeader>
						<CardContent className="space-y-2">
							{[1, 2, 3].map((j) => (
								<Skeleton key={j} className="h-10 w-full" />
							))}
						</CardContent>
					</Card>
				))}
			</div>
		</main>
	);
}
