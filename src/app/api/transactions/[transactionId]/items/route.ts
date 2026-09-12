import { NextResponse } from "next/server";
import { fetchTransactionItems } from "@/features/transactions/lib/item-queries";
import { getOptionalUserSession } from "@/shared/lib/auth/server";

const PRIVATE_RESPONSE_HEADERS = {
	"Cache-Control": "private, no-store",
};

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ transactionId: string }> },
) {
	const [session, { transactionId }] = await Promise.all([
		getOptionalUserSession(),
		params,
	]);

	if (!session?.user) {
		return NextResponse.json(
			{ error: "Não autenticado" },
			{ status: 401, headers: PRIVATE_RESPONSE_HEADERS },
		);
	}

	const items = await fetchTransactionItems(session.user.id, transactionId);

	return NextResponse.json(items, {
		headers: PRIVATE_RESPONSE_HEADERS,
	});
}
