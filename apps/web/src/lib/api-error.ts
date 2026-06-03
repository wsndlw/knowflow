/**
 * 后端错误消息 → 中文映射。
 *
 * 后端部分 BadRequest/Forbidden 错误为英文（统一中文属后端范围），
 * 前端在展示前做一层映射，避免中文界面里出现英文报错。未命中则原样返回。
 */
const ERROR_MESSAGE_ZH: Record<string, string> = {
  // 思维导图
  "Knowledge base has no documents or knowledge items":
    "知识库暂无文档或知识条目，无法生成思维导图",
  "Mind map cannot exceed 200 nodes": "思维导图节点不能超过 200 个",
  "Mind map node ids must be unique": "节点 ID 必须唯一，请重试",
  "Mind map parentId must reference a submitted node": "存在无效的父节点引用，请重试",
  "Mind map references must belong to this knowledge base": "节点引用必须属于本知识库",
  "Cannot manage mind map in this knowledge base": "你没有编辑本知识库思维导图的权限",
  // 审计日志
  "Cannot read audit logs in this knowledge base": "你没有查看本知识库操作日志的权限",
  // 通用
  "Knowledge base not found": "知识库不存在",
};

export function translateApiError(message: string): string {
  return ERROR_MESSAGE_ZH[message] ?? message;
}
