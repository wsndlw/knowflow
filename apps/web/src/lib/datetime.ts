import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

/** 相对时间，如"2 分钟前"。无效时间返回空串。 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return formatDistanceToNow(date, { addSuffix: true, locale: zhCN });
}

/** 绝对时间，如"2026/06/03 14:32:05"。 */
export function formatAbsoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
