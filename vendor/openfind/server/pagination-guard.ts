// A repeated cursor, including A → B → A, must not consume more API requests.
export function paginationGuard() {
  const seen = new Set<string>();
  return (cursor: string | null) => {
    if (!cursor) return;
    if (seen.has(cursor)) throw new Error('数据源返回循环分页游标，已停止请求并保留结果');
    seen.add(cursor);
  };
}
