"use client";

import { RiExternalLinkLine, RiSearchLine } from "@remixicon/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
	MANUAL_GROUPS,
	MANUAL_SECTIONS,
	type ManualSection,
} from "@/features/manual/lib/manual-content";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";

function normalize(value: string) {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "");
}

function sectionMatches(section: ManualSection, query: string) {
	if (!query) return true;
	const haystack = normalize(
		[
			section.title,
			section.summary,
			section.keywords ?? "",
			...(section.steps ?? []),
			...(section.notes ?? []),
		].join(" "),
	);
	return query
		.split(/\s+/)
		.filter(Boolean)
		.every((term) => haystack.includes(term));
}

function ManualSectionCard({ section }: { section: ManualSection }) {
	return (
		<Card id={section.id} className="scroll-mt-24">
			<CardContent className="space-y-3">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<h3 className="text-base font-semibold">{section.title}</h3>
					{section.href ? (
						<Button asChild variant="outline" size="sm">
							<Link href={section.href}>
								Abrir
								<RiExternalLinkLine />
							</Link>
						</Button>
					) : null}
				</div>
				<p className="text-sm text-muted-foreground">{section.summary}</p>

				{section.steps ? (
					<div className="space-y-1">
						<p className="text-sm font-medium">Como fazer</p>
						<ol className="list-decimal space-y-1 pl-5 text-sm">
							{section.steps.map((step) => (
								<li key={step}>{step}</li>
							))}
						</ol>
					</div>
				) : null}

				{section.notes ? (
					<div className="space-y-1">
						<p className="text-sm font-medium">
							{section.steps ? "Bom saber" : "Detalhes"}
						</p>
						<ul className="list-disc space-y-1 pl-5 text-sm">
							{section.notes.map((note) => (
								<li key={note}>{note}</li>
							))}
						</ul>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

export function ManualPage() {
	const [query, setQuery] = useState("");
	const normalizedQuery = normalize(query.trim());

	const visibleSections = useMemo(
		() =>
			MANUAL_SECTIONS.filter((section) =>
				sectionMatches(section, normalizedQuery),
			),
		[normalizedQuery],
	);

	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-20 md:pb-0">
			<div>
				<h1 className="text-xl font-semibold">Manual do OpenMonetis</h1>
				<p className="text-sm text-muted-foreground">
					Como o sistema funciona, tela por tela, e a rotina para mantê-lo em
					dia.
				</p>
			</div>

			<div className="relative max-w-md">
				<RiSearchLine
					className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					aria-hidden
				/>
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Buscar no manual (ex.: fatura, diário, saldo)"
					aria-label="Buscar no manual"
					className="pl-9"
				/>
			</div>

			<div className="grid gap-6 md:grid-cols-[14rem_1fr]">
				<nav
					aria-label="Índice do manual"
					className="md:sticky md:top-24 md:self-start"
				>
					<ul className="flex flex-col gap-3 text-sm">
						{MANUAL_GROUPS.map((group) => {
							const items = visibleSections.filter(
								(section) => section.group === group,
							);
							if (items.length === 0) return null;
							return (
								<li key={group}>
									<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										{group}
									</p>
									<ul className="flex flex-col gap-1">
										{items.map((section) => (
											<li key={section.id}>
												<a
													href={`#${section.id}`}
													className="text-foreground hover:text-primary"
												>
													{section.title}
												</a>
											</li>
										))}
									</ul>
								</li>
							);
						})}
					</ul>
				</nav>

				<div className="flex flex-col gap-4">
					{visibleSections.length === 0 ? (
						<Card>
							<CardContent>
								<p className="text-sm text-muted-foreground">
									Nada encontrado para essa busca. Tente outra palavra.
								</p>
							</CardContent>
						</Card>
					) : (
						visibleSections.map((section) => (
							<ManualSectionCard key={section.id} section={section} />
						))
					)}
				</div>
			</div>
		</main>
	);
}
