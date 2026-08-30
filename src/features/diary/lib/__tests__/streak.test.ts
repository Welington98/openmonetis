import { describe, expect, it } from "vitest";
import {
	computeStreakOnSave,
	resolveDisplayStreak,
} from "@/features/diary/lib/streak";
import { getBusinessDateString } from "@/shared/utils/date";

describe("computeStreakOnSave", () => {
	it("first-ever check-in starts the streak at 1", () => {
		const result = computeStreakOnSave({
			today: "2026-08-30",
			isEditOfToday: false,
			previousLastEntryDate: null,
			previousCurrentStreak: 0,
			previousLongestStreak: 0,
		});

		expect(result).toEqual({
			currentStreak: 1,
			longestStreak: 1,
			lastEntryDate: "2026-08-30",
		});
	});

	it("increments across three consecutive days and tracks the longest streak", () => {
		const day1 = computeStreakOnSave({
			today: "2026-08-28",
			isEditOfToday: false,
			previousLastEntryDate: null,
			previousCurrentStreak: 0,
			previousLongestStreak: 0,
		});
		expect(day1.currentStreak).toBe(1);

		const day2 = computeStreakOnSave({
			today: "2026-08-29",
			isEditOfToday: false,
			previousLastEntryDate: day1.lastEntryDate,
			previousCurrentStreak: day1.currentStreak,
			previousLongestStreak: day1.longestStreak,
		});
		expect(day2.currentStreak).toBe(2);
		expect(day2.longestStreak).toBe(2);

		const day3 = computeStreakOnSave({
			today: "2026-08-30",
			isEditOfToday: false,
			previousLastEntryDate: day2.lastEntryDate,
			previousCurrentStreak: day2.currentStreak,
			previousLongestStreak: day2.longestStreak,
		});
		expect(day3.currentStreak).toBe(3);
		expect(day3.longestStreak).toBe(3);
	});

	it("editing the same day's entry does not double-increment", () => {
		const firstSave = computeStreakOnSave({
			today: "2026-08-30",
			isEditOfToday: false,
			previousLastEntryDate: "2026-08-29",
			previousCurrentStreak: 5,
			previousLongestStreak: 5,
		});
		expect(firstSave.currentStreak).toBe(6);

		const editSameDay = computeStreakOnSave({
			today: "2026-08-30",
			isEditOfToday: true,
			previousLastEntryDate: firstSave.lastEntryDate,
			previousCurrentStreak: firstSave.currentStreak,
			previousLongestStreak: firstSave.longestStreak,
		});

		expect(editSameDay.currentStreak).toBe(6);
		expect(editSameDay.longestStreak).toBe(6);
	});

	it("resets to 1 after skipping exactly one full day", () => {
		const result = computeStreakOnSave({
			today: "2026-08-30",
			isEditOfToday: false,
			previousLastEntryDate: "2026-08-28", // faltou o dia 29
			previousCurrentStreak: 10,
			previousLongestStreak: 10,
		});

		expect(result.currentStreak).toBe(1);
		expect(result.longestStreak).toBe(10);
	});

	it("resets to 1 after skipping several days", () => {
		const result = computeStreakOnSave({
			today: "2026-08-30",
			isEditOfToday: false,
			previousLastEntryDate: "2026-08-10",
			previousCurrentStreak: 20,
			previousLongestStreak: 20,
		});

		expect(result.currentStreak).toBe(1);
		expect(result.longestStreak).toBe(20);
	});

	it("never decreases longestStreak across a reset", () => {
		const result = computeStreakOnSave({
			today: "2026-09-05",
			isEditOfToday: false,
			previousLastEntryDate: "2026-08-01",
			previousCurrentStreak: 1,
			previousLongestStreak: 100,
		});

		expect(result.currentStreak).toBe(1);
		expect(result.longestStreak).toBe(100);
	});
});

describe("resolveDisplayStreak", () => {
	it("shows the stored streak when today's check-in is already done", () => {
		const result = resolveDisplayStreak(
			{ currentStreak: 7, longestStreak: 12, lastEntryDate: "2026-08-30" },
			"2026-08-30",
		);

		expect(result).toEqual({
			currentStreak: 7,
			longestStreak: 12,
			hasCheckedInToday: true,
			isBrokenSinceLastEntry: false,
		});
	});

	it("keeps the streak alive during the grace period (last entry was yesterday)", () => {
		const result = resolveDisplayStreak(
			{ currentStreak: 7, longestStreak: 12, lastEntryDate: "2026-08-29" },
			"2026-08-30",
		);

		expect(result.currentStreak).toBe(7);
		expect(result.hasCheckedInToday).toBe(false);
		expect(result.isBrokenSinceLastEntry).toBe(false);
	});

	it("displays a broken streak (0) after 2+ missed days without touching longestStreak", () => {
		const result = resolveDisplayStreak(
			{ currentStreak: 7, longestStreak: 12, lastEntryDate: "2026-08-20" },
			"2026-08-30",
		);

		expect(result.currentStreak).toBe(0);
		expect(result.longestStreak).toBe(12);
		expect(result.isBrokenSinceLastEntry).toBe(true);
	});

	it("displays a broken streak when there was never a check-in", () => {
		const result = resolveDisplayStreak(
			{ currentStreak: 0, longestStreak: 0, lastEntryDate: null },
			"2026-08-30",
		);

		expect(result.currentStreak).toBe(0);
		expect(result.isBrokenSinceLastEntry).toBe(true);
	});
});

describe("timezone safety around the business day boundary", () => {
	it("resolves the same business date for two UTC instants that are still 'today' in America/Sao_Paulo", () => {
		// 2026-08-31T02:30:00Z é 2026-08-30T23:30 em America/Sao_Paulo (UTC-3):
		// ainda é o mesmo dia civil de negócio, mesmo cruzando a meia-noite UTC.
		const earlierInstant = new Date("2026-08-30T18:00:00Z");
		const nearMidnightUtc = new Date("2026-08-31T02:30:00Z");

		const earlierBusinessDate = getBusinessDateString(earlierInstant);
		const laterBusinessDate = getBusinessDateString(nearMidnightUtc);

		expect(earlierBusinessDate).toBe("2026-08-30");
		expect(laterBusinessDate).toBe("2026-08-30");
		expect(laterBusinessDate).toBe(earlierBusinessDate);
	});

	it("does treat an instant past local midnight in America/Sao_Paulo as the next business day", () => {
		// 2026-08-31T03:30:00Z = 2026-08-31T00:30 em America/Sao_Paulo: já virou o dia.
		const pastLocalMidnight = new Date("2026-08-31T03:30:00Z");

		expect(getBusinessDateString(pastLocalMidnight)).toBe("2026-08-31");
	});
});
