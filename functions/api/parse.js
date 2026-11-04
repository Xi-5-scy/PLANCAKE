// functions/api/parse.js

const SYSTEM_PROMPT = `你是专业旅行规划师。只输出一个纯 JSON 对象，不要任何解释、前后缀文字或 markdown 代码块。
结构必须严格如下：
{
  "destination": "城市或地区名",
  "days": 3,
  "dailyPlan": [
    "Day1: 上午去A，下午去B，晚上吃C",
    "Day2: 上午去D，下午去E，晚上吃F",
    "Day3: 上午去G，下午去H"
  ]
}
规则：
- days 必须等于 dailyPlan 数组长度。
- dailyPlan 的每一项必须是字符串，格式 "DayN: ..."。
- 每天描述要具体到景点/餐厅名称，不要空泛。
- 若用户需求含糊，给合理默认值，但不要反问。`;

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" }
  });
}

// 从任意 AI 文本中抽取第一个完整 JSON 对象
function extractJson(text) {
  const cleaned = String(text)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI 未返回 JSON 对象");
  }
  const candidate = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    // 尝试修复常见问题：尾逗号
    const fixed = candidate.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(fixed);
  }
}

// 归一化 & 校验，确保前端拿到的结构稳定
function normalizeSeed(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI 返回结构不是对象");
  }

  const destination =
    typeof parsed.destination === "string" ? parsed.destination.trim() : "";
  if (!destination) throw new Error("AI 未返回 destination");

  let dailyPlan = parsed.dailyPlan;
  if (typeof dailyPlan === "string") dailyPlan = [dailyPlan];
  if (!Array.isArray(dailyPlan)) throw new Error("dailyPlan 不是数组");

  dailyPlan = dailyPlan
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean);

  if (dailyPlan.length === 0) throw new Error("dailyPlan 为空");

  // 以 dailyPlan.length 为准，避免 days 与计划条数不一致
  return { destination, days: dailyPlan.length, dailyPlan };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "请求格式错误，需为 JSON" }, 400);
  }

  const userText =
    typeof body?.text === "string" ? body.text.trim() : "";
  if (!userText) {
    return json({ ok: false, error: "缺少需求文本" }, 400);
  }
  if (userText.length > 2000) {
    return json({ ok: false, error: "需求描述过长（上限 2000 字）" }, 413);
  }

  if (!env.AI) {
    return json(
      {
        ok: false,
        error: "AI 绑定未生效：请确认 wrangler.toml 中有 [ai] binding = \"AI\" 并重新部署"
      },
      500
    );
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userText }
  ];

  try {
    const response = await env.AI.run("@cf/qwen/qwen1.5-14b-chat-awq", {
      messages,
      max_tokens: 1024,
      temperature: 0.2 // 低温度提升 JSON 稳定性
    });

    // 兼容字符串 / { response } / { choices: [...] } 多种返回结构
    const rawText =
      typeof response === "string"
        ? response
        : response?.response ??
          response?.choices?.[0]?.message?.content ??
          JSON.stringify(response);

    const parsed = extractJson(rawText);
    const seed = normalizeSeed(parsed);

    return json({ ok: true, seed });
  } catch (err) {
    return json(
      {
        ok: false,
        error: "AI 调用或解析失败",
        detail: err?.message ?? String(err)
      },
      502
    );
  }
}
