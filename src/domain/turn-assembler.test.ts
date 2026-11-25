import { describe, expect, it } from "vitest";
import { TurnAssembler } from "./turn-assembler";

describe("TurnAssembler", () => {
  it("keeps text and cards in the order they happened", () => {
    const turn = new TurnAssembler();
    turn.addStep({ label: "consultou o INC-20311" });
    turn.addBlock({ kind: "ticketList", rows: [] });
    turn.appendText("Está sem atualização ");
    turn.appendText("há 6 dias.");

    const message = turn.build();
    expect(message.steps).toEqual([{ label: "consultou o INC-20311" }]);
    expect(message.blocks).toEqual([
      { kind: "ticketList", rows: [] },
      { kind: "bubble", text: "Está sem atualização há 6 dias." },
    ]);
  });

  it("closes the text written before a card", () => {
    const turn = new TurnAssembler();
    turn.appendText("Confira o rascunho:");
    turn.addBlock({ kind: "ticketList", rows: [] });
    expect(turn.build().blocks.map((b) => b.kind)).toEqual(["bubble", "ticketList"]);
  });

  it("attaches quick answers to the text written before them", () => {
    const turn = new TurnAssembler();
    turn.appendText("Não há chamado sobre VPN.");
    turn.addQuestion("Quem é afetado?", [{ id: "self", label: "Só eu" }]);
    expect(turn.build().blocks).toEqual([
      { kind: "bubble", text: "Não há chamado sobre VPN.", question: "Quem é afetado?", options: [{ id: "self", label: "Só eu" }] },
    ]);
  });

  it("uses the question as the text when nothing was written before it", () => {
    const turn = new TurnAssembler();
    turn.addQuestion("Quem é afetado?", [{ id: "self", label: "Só eu" }]);
    expect(turn.build().blocks[0]).toMatchObject({ text: "Quem é afetado?", options: [{ id: "self", label: "Só eu" }] });
  });

  it("shows the text still being written without closing it", () => {
    const turn = new TurnAssembler();
    turn.appendText("Olá");
    expect(turn.snapshot("live").blocks).toEqual([{ kind: "bubble", text: "Olá" }]);
    turn.appendText(", Ana");
    expect(turn.build().blocks).toEqual([{ kind: "bubble", text: "Olá, Ana" }]);
  });

  it("carries the decision and ignores blank text", () => {
    const turn = new TurnAssembler();
    turn.appendText("   ");
    turn.setDecision({ understood: "a", action: "b", confidence: 0.9, reason: "c" });
    expect(turn.hasContent).toBe(false);
    expect(turn.build()).toMatchObject({ blocks: [], decision: { confidence: 0.9 } });
  });

  it("says nothing more after a question", () => {
    const turn = new TurnAssembler();
    turn.addQuestion("Quem é afetado?", [{ id: "o1", label: "Só eu" }]);
    expect(turn.accepts({ type: "text", delta: "(Aguardando resposta)" })).toBe(false);
    expect(turn.accepts({ type: "question", question: "De novo?", options: [] })).toBe(false);
    turn.appendText("(Aguardando resposta)");
    expect(turn.build().blocks).toHaveLength(1);
  });

  it("tags the decision with who made it, without overwriting a source already set", () => {
    const turn = new TurnAssembler();
    turn.tagDecision("main", "kimi"); // no decision yet: nothing to tag
    expect(turn.build().decision).toBeUndefined();

    const withDecision = new TurnAssembler();
    withDecision.setDecision({ understood: "a", action: "b", confidence: 0.8, reason: "c" });
    withDecision.tagDecision("main", "kimi-k2.6:cloud");
    withDecision.tagDecision("fast", "gemma");
    expect(withDecision.build().decision).toMatchObject({ source: "main", model: "kimi-k2.6:cloud" });

    const byCode = new TurnAssembler();
    byCode.setDecision({ understood: "a", action: "b", confidence: 1, reason: "c", source: "code" });
    byCode.tagDecision("main", "kimi");
    expect(byCode.build().decision?.source).toBe("code");
  });
});
