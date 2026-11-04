export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS（可选）
  // ...

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "请求格式错误，需为 JSON" }, 400);
  }

  const userText = typeof body?.text === "string" ? body.text.trim() : "";
  if (!userText) return json({ ok: false, error: "缺少需求文本" }, 400);
  if (userText.length > 2000) return json({ ok: false, error: "需求描述过长（上限 2000 字）" }, 400);

  if (!env.AI) {
    return json({ ok: false, error: "AI 绑定未生效，请检查 wrangler.toml 的 [ai] binding = \"AI\" 并重新部署" }, 500);
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userText },
  ];

  try {
    const response = await env.AI.run("@cf/qwen/qwen1.5-14b-chat-awq", {
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    });

    const rawText = typeof response === "string"
      ? response
      : response?.response ?? JSON.stringify(response);

    const parsed = extractJson(rawText);
    const seed = normalizeSeed(parsed);

    return json({ ok: true, seed });
  } catch (err) {
    return json({
      ok: false,
      error: "AI 调用或解析失败",
      detail: err?.message ?? String(err),
    }, 502);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
