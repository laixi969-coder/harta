/* 用户可输入内容的唯一后端口径。前端的 maxlength 负责提前拦住，
 * 这里负责防止绕过页面直接请求，也避免“存得进去、实际只用一截”的静默丢字。 */
export const INPUT_LIMITS = Object.freeze({
  email: 254,
  password: 128,
  hunt: 24,
  customerName: 80,
  city: 40,
  pitch: 300,
  materialUrl: 2048,
  salesMaterial: 12000,
  analysisOverview: 3000,
  analysisGroup: 4000,
  analysisSourceNote: 1000,
  ledgerQuote: 120,
  ledgerTalk: 4000,
  lineEdit: 2000,
  providerName: 20,
  apiKey: 4096,
  baseUrl: 2048,
  modelName: 256,
});

export function textField(value, label, max, { required = false, min = 0 } = {}) {
  const text = String(value || "").trim();
  if (required && !text) return { text, error: `${label}不能为空` };
  if (text.length > max) return { text, error: `${label}最多 ${max.toLocaleString("zh-CN")} 个字` };
  if (text && text.length < min) return { text, error: `${label}至少 ${min} 个字` };
  return { text, error: "" };
}
