export type AccessibleKnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
};

type PromptKnowledgeBase = {
  id: string;
  name: string;
  description: string | null;
};

const LABEL_MAX_LENGTH = 160;
const DESCRIPTION_MAX_LENGTH = 500;
const WHITESPACE = /\s+/g;

const CHINESE_SCOPE_PATTERNS = [
  /(?:我|俺|自己|当前用户|该用户|用户).{0,12}(?:能|可以|可|有权限).{0,12}(?:访问|使用|问|询问).{0,12}(?:哪些|哪几个|什么).{0,8}知识库/u,
  /(?:我|俺|自己|当前用户|该用户|用户).{0,12}(?:有哪些|有什么).{0,12}(?:能|可以|可|有权限).{0,12}(?:访问|使用|问|询问).{0,8}知识库/u,
  /(?:哪些|哪几个|什么).{0,8}知识库.{0,12}(?:我|俺|自己|当前用户|该用户|用户).{0,12}(?:能|可以|可|有权限).{0,12}(?:访问|使用|问|询问)/u,
  /(?:能|可以|可).{0,8}(?:问|询问|访问|使用).{0,8}(?:哪些|哪几个|什么).{0,8}知识库/u,
];

const ENGLISH_SCOPE_PATTERNS = [
  /\b(?:which|what)\s+knowledge\s+bases?\s+(?:can|may)\s+i\s+(?:ask|access|use)\b/u,
  /\b(?:what|which)\s+knowledge\s+bases?\s+(?:are\s+)?(?:available|accessible)\s+to\s+me\b/u,
  /\b(?:can|may)\s+i\s+(?:ask|access|use)\s+(?:which|what)\s+knowledge\s+bases?\b/u,
  /\bmy\s+(?:available|accessible)\s+knowledge\s+bases?\b/u,
];

export function isKnowledgeScopeQuestion(query: string): boolean {
  const compact = query.replace(WHITESPACE, "");
  const lower = query.toLowerCase().replace(WHITESPACE, " ").trim();
  const mentionsKnowledgeBase = compact.includes("知识库") || lower.includes("knowledge base");
  if (!mentionsKnowledgeBase) {
    return false;
  }

  return (
    CHINESE_SCOPE_PATTERNS.some((pattern) => pattern.test(compact)) ||
    ENGLISH_SCOPE_PATTERNS.some((pattern) => pattern.test(lower))
  );
}

export function formatAccessibleKnowledgeBases(items: AccessibleKnowledgeBase[]): string {
  if (items.length === 0) {
    return "none";
  }

  return toPromptKnowledgeBases(items)
    .map((item, index) => {
      const description =
        item.description === null || item.description.length === 0 ? "" : ` - ${item.description}`;
      return `${String(index + 1)}. ${item.name}${description}`;
    })
    .join("\n");
}

export function formatAccessibleKnowledgeBasesForPrompt(
  items: AccessibleKnowledgeBase[],
): string {
  return JSON.stringify(toPromptKnowledgeBases(items), null, 2);
}

export function buildKnowledgeScopeAnswer(items: AccessibleKnowledgeBase[]): string {
  if (items.length === 0) {
    return "你当前没有可访问的知识库。可以联系管理员为你开通知识库权限。";
  }

  return `你当前可以询问这些知识库：\n${formatAccessibleKnowledgeBases(items)}`;
}

function toPromptKnowledgeBases(items: AccessibleKnowledgeBase[]): PromptKnowledgeBase[] {
  return items.map((item) => ({
    id: item.id,
    name: sanitizeLabel(item.name, LABEL_MAX_LENGTH),
    description:
      item.description === null ? null : sanitizeLabel(item.description, DESCRIPTION_MAX_LENGTH),
  }));
}

function sanitizeLabel(value: string, maxLength: number): string {
  return Array.from(value, (char) => (isControlCharacter(char) ? " " : char))
    .join("")
    .replace(WHITESPACE, " ")
    .trim()
    .slice(0, maxLength);
}

function isControlCharacter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
}
