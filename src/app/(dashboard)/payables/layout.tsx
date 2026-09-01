import { RiExchangeDollarLine } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Contas a pagar/receber",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiExchangeDollarLine />}
				title="Contas a pagar/receber"
				subtitle="Acompanhe o que está pendente no mês selecionado — contas atrasadas de outros meses continuam aparecendo até serem resolvidas."
			/>
			{children}
		</section>
	);
}
