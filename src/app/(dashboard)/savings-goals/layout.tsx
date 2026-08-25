import { RiFlag2Line } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Metas",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiFlag2Line />}
				title="Metas"
				subtitle="Defina objetivos de acúmulo para suas contas e acompanhe o progresso a partir do saldo real."
			/>
			{children}
		</section>
	);
}
