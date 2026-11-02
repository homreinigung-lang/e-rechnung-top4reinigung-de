import { describe, expect, it } from "vitest";
import { parseWasteLines, isWasteDue } from "./waste-calendar";
describe("waste calendar",()=>{
 it("only imports manually selected bin types",()=>{
  expect(parseWasteLines("04.11.2026 Restmüll\n05.11.2026 Papier",["rest"])).toEqual([{bin_type:"rest",collection_date:"2026-11-04"}]);
 });
 it("rejects impossible dates and ambiguous lines",()=>{
  expect(parseWasteLines("31.02.2026 Restmüll\n04.11.2026 Restmüll Papier",["rest","papier"])).toEqual([]);
 });
 it("detects upcoming reminders",()=>{
  expect(isWasteDue("2026-11-04","2026-11-03",1)).toBe(true);
  expect(isWasteDue("2026-11-04","2026-11-02",1)).toBe(false);
 });
});
