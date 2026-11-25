/** Text helpers shared by the help-center search and the duplicate check. */

const STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
  "e", "ou", "que", "com", "para", "por", "meu", "minha", "meus", "minhas", "eu", "nao", "esta", "estou",
  "como", "qual", "tenho", "desde", "ao", "se", "ja", "mais", "muito",
]);

/** Lowercase and strip accents, so "conexão" matches "conexao". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}
