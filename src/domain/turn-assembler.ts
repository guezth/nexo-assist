import type { AgentBlock, AgentMessageView, DecisionView, OptionView, StepView, TurnEvent } from "./chat";

/**
 * Builds the agent's message from the events of a turn, in the order they
 * happened: text the model writes becomes a bubble, tool results become cards.
 * The server uses it to store the message and the screen uses it to show the
 * answer while it is still being written, so both see the same thing.
 */
export class TurnAssembler {
  private steps: StepView[] = [];
  private blocks: AgentBlock[] = [];
  private text = "";
  private decision: DecisionView | undefined;
  /** A question with quick answers closes the turn: the person must answer before anything else is said. */
  private asked = false;

  addStep(step: StepView): void {
    this.steps.push(step);
  }

  appendText(delta: string): void {
    if (!this.asked) this.text += delta;
  }

  addBlock(block: AgentBlock): void {
    this.flushText();
    this.blocks.push(block);
  }

  /** A question with quick answers. The text written so far becomes the bubble that carries them. */
  addQuestion(question: string, options: OptionView[]): void {
    if (this.asked) return;
    const intro = this.text.trim();
    this.text = "";
    this.blocks.push(
      intro ? { kind: "bubble", text: intro, question, options } : { kind: "bubble", text: question, options },
    );
    this.asked = true;
  }

  setDecision(decision: DecisionView): void {
    this.decision = decision;
  }

  /** False for events that would not change the message, so they need not be shown. */
  accepts(event: TurnEvent): boolean {
    return !(this.asked && (event.type === "text" || event.type === "block" || event.type === "question"));
  }

  /** Says who made the decision that was recorded, if one was. */
  tagDecision(source: NonNullable<DecisionView["source"]>, model?: string): void {
    if (this.decision && !this.decision.source) this.decision = { ...this.decision, source, ...(model ? { model } : {}) };
  }

  apply(event: TurnEvent): void {
    if (event.type === "step") this.addStep(event.step);
    else if (event.type === "text") this.appendText(event.delta);
    else if (event.type === "block") this.addBlock(event.block);
    else if (event.type === "question") this.addQuestion(event.question, event.options);
  }

  get hasContent(): boolean {
    return this.blocks.length > 0 || this.text.trim() !== "";
  }

  /** Steps recorded in this message so far. */
  stepsCount(): number {
    return this.steps.length;
  }

  /** The message as it stands, without closing the text that is still being written. */
  snapshot(id: string): AgentMessageView {
    return { id, ...this.parts(this.text) };
  }

  build(): Omit<AgentMessageView, "id"> {
    this.flushText();
    return this.parts("");
  }

  private parts(pendingText: string): Omit<AgentMessageView, "id"> {
    const text = pendingText.trim();
    const blocks = text ? [...this.blocks, { kind: "bubble" as const, text }] : [...this.blocks];
    return { role: "agent", steps: [...this.steps], blocks, ...(this.decision ? { decision: this.decision } : {}) };
  }

  private flushText(): void {
    const text = this.text.trim();
    this.text = "";
    if (text) this.blocks.push({ kind: "bubble", text });
  }
}
