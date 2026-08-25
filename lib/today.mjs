/* 档上的日期是给人看的，得用他所在时区的今天。
 * toISOString() 取的是 UTC：中国用户早上 8 点前出的档会被标成昨天，
 * 晚上出的又可能跳到明天。这里的 today() 永远返回本地的 YYYY-MM-DD。 */

const pad = (n) => String(n).padStart(2, "0");

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
