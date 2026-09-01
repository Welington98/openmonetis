import { Skeleton } from "@/shared/components/ui/skeleton";

export default function PayablesLoading() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-9 w-64 rounded-md bg-foreground/10" />
			<div className="space-y-1">
				{Array.from({ length: 6 }).map((_, i) => (
					<Skeleton
						key={i}
						className="h-[3.25rem] w-full rounded-md bg-foreground/10"
					/>
				))}
			</div>
		</div>
	);
}
