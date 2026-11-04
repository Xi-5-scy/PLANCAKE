// functions/api/parse.js
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false, error: "请求格式错误" }, { status: 400 }); }

  const userText = body.text;
  if (!userText) return Response.json({ ok: false, error: "缺少需求" }, { status: 400 });

  if (!env.AI) {
    return Response.json({ ok: false, error: "AI 绑定未生效，请检查 wrangler.toml 配置并重新部署" }, { status: 500 });
  }

  const messages = [
    {
      role: "system",
      content: `你是旅行规划师。只输出纯 JSON，不要 markdown 标记。
格式：
{
  "destination": "目的地",
  "days": 3,
  "dailyPlan": ["Day1: 上午去A，下午去B，晚上吃C", "Day2: 上午去D，下午去E", "Day3: 上午去F"]
}`
    },
    { role: "user", content: userText }
  ];

  try {
    const response = await env.AI.run("@cf/qwen/qwen1.5-14b-chat-awq", {
      messages,
      max_tokens: 2048
    });

    let rawText = response.response || response;
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(rawText);

    if (!Array.isArray(parsed.dailyPlan)) {
      parsed.dailyPlan = [parsed.dailyPlan];
    }

    return Response.json({ ok: true, seed: parsed });

  } catch (err) {
    return Response.json({ 
      ok: false, 
      error: "AI 调用或解析失败",
      detail: err.message 
    }, { status: 200 });
  }
}
