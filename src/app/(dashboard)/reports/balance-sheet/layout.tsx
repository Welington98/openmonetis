import { RiScales3Line } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Balanço Patrimonial",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiScales3Line />}
				title="Balanço Patrimonial"
				subtitle="Ativo, passivo e patrimônio líquido consolidados das suas contas."
			/>
			{children}
		</section>
	);
}
