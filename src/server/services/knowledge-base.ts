import type { HelpArticle } from "@/domain/types";
import { normalize, tokenize } from "@/lib/text";

export interface ArticleHit {
  article: HelpArticle;
  score: number;
}

export interface KnowledgeBase {
  search(query: string, limit?: number): Promise<ArticleHit[]>;
}

const WEIGHTS = { title: 3, tag: 3, body: 1, tagPhrase: 5 };

/**
 * Simple keyword search over the seed articles: no external service, fully
 * explainable (the score shows up in the transparency panel). A semantic
 * search could replace this class without touching its callers.
 */
export class KeywordKnowledgeBase implements KnowledgeBase {
  constructor(private readonly articles: HelpArticle[]) {}

  async search(query: string, limit = 3): Promise<ArticleHit[]> {
    const queryTokens = [...new Set(tokenize(query))];
    const normalizedQuery = normalize(query);
    if (queryTokens.length === 0) return [];

    const hits = this.articles.map((article) => {
      const titleTokens = new Set(tokenize(article.title));
      const bodyTokens = new Set(tokenize(article.body));
      const tags = article.tags.map(normalize);
      const tagTokens = new Set(tags.flatMap(tokenize));

      let score = 0;
      for (const token of queryTokens) {
        if (titleTokens.has(token)) score += WEIGHTS.title;
        if (tagTokens.has(token)) score += WEIGHTS.tag;
        if (bodyTokens.has(token)) score += WEIGHTS.body;
      }
      // Multi-word tags such as "erro 809" are strong signals when they appear verbatim.
      for (const tag of tags) {
        if (tag.includes(" ") && normalizedQuery.includes(tag)) score += WEIGHTS.tagPhrase;
      }
      return { article, score };
    });

    return hits
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
