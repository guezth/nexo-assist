/** Feedback de um funcionária sobre uma resposta do agent. */
export type FeedbackRating = "good" | "needs_improvement";

export interface AnswerFeedback {
  messageId: number;
  rating: FeedbackRating;
  at: string;
}
