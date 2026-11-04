// functions/api/inspire.js
export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false }); }

  const dest = body.dest;
  if (!dest) return Response.json({ ok: false, error: "缺少目的地" });

  if (!env.AI) return Response.json({ ok: false, error: "AI 未绑定" });

  const messages = [
    {
      role: "system",
      content: `你是旅行灵感推荐官。针对用户给出的目的地，推荐3个著名景点和3个特色美食。只输出纯JSON，不要markdown标记。
格式：
{
  "attractions": [
    {"name": "景点1", "desc": "一句简短介绍"},
    {"name": "景点2", "desc": "一句简短介绍"},
    {"name": "景点3", "desc": "一句简短介绍"}
  ],
  "foods": [
    {"name": "美食1", "desc": "一句简短介绍"},
    {"name": "美食2", "desc": "一句简短介绍"},
    {"name": "美食3", "desc": "一句简短介绍"}
  ]
}`
    },
    { role: "user", content: `目的地：${dest}` }
  ];

  try {
    const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages, max_tokens: 1024
    });

    let rawText = response.response || response;
    rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const start = rawText.indexOf('{'), end = rawText.lastIndexOf('}');
    if (start !== -1 && end !== -1) rawText = rawText.substring(start, end + 1);

    const parsed = JSON.parse(rawText);
    return Response.json({ ok: true, data: parsed });
  } catch (err) {
    return Response.json({ ok: false, error: err.message });
  }
}
