import { describe, expect, it } from "vitest";
import { buildTickets } from "@/data/seed";
import { isOpen } from "./rules";
import { findDuplicateCandidates } from "./duplicates";

const NOW = new Date("2025-10-21T15:00:00Z");
const ana = buildTickets(NOW).filter((t) => t.requesterId === 1 && isOpen(t));

describe("findDuplicateCandidates", () => {
  it("finds the open ticket about the same problem", () => {
    const found = findDuplicateCandidates(
      { title: "Notebook muito lento", description: "Lentidão depois da atualização do Windows no notebook", category: "Hardware" },
      ana,
    );
    expect(found.map((t) => t.code)).toEqual(["INC-20311"]);
  });

  it("does not mix categories or unrelated problems", () => {
    expect(
      findDuplicateCandidates({ title: "Notebook lento", description: "atualização do Windows", category: "Rede e VPN" }, ana),
    ).toEqual([]);
    expect(findDuplicateCandidates({ title: "VPN não conecta", description: "erro 809", category: "Rede e VPN" }, ana)).toEqual([]);
  });
});
