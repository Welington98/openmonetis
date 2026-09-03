"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/shared/utils/ui";

function Tabs({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

const tabsListVariants = cva(
	"text-muted-foreground inline-flex h-9 w-full items-center justify-start rounded-none border-b bg-transparent p-0",
	{
		variants: {
			variant: {
				default: "",
				stacked: "grid h-auto w-full sm:inline-flex sm:h-9 sm:grid-cols-none",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function TabsList({
	className,
	variant,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
	VariantProps<typeof tabsListVariants>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(tabsListVariants({ variant }), className)}
			{...props}
		/>
	);
}

const tabsTriggerVariants = cva(
	"ring-offset-background focus-visible:ring-ring data-[state=active]:bg-background text-muted-foreground data-[state=active]:border-b-primary data-[state=active]:text-foreground relative inline-flex h-9 items-center justify-center rounded-none border-b-2 border-b-transparent bg-transparent px-4 py-1 pt-2 pb-3 text-sm font-medium whitespace-nowrap shadow-none transition-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-none",
	{
		variants: {
			variant: {
				default: "",
				stacked: "h-11 min-w-0 sm:h-9",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function TabsTrigger({
	className,
	variant,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
	VariantProps<typeof tabsTriggerVariants>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(tabsTriggerVariants({ variant }), className)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
