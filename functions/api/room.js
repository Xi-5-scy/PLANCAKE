export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'POST') {
    try {
      const body = await request.json();
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const initialData = JSON.stringify(body.data || {});
      await env.DB.prepare("INSERT INTO rooms (id, data) VALUES (?, ?)").bind(roomId, initialData).run();
      return Response.json({ ok: true, roomId });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  }

  if (method === 'GET') {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('id');
    if (!roomId) return Response.json({ ok: false, error: "缺少房间号" });
    try {
      const result = await env.DB.prepare("SELECT data FROM rooms WHERE id = ?").bind(roomId).first();
      if (!result) return Response.json({ ok: false, error: "房间不存在" });
      return Response.json({ ok: true, data: JSON.parse(result.data) });
    } catch (err) {
      return Response.json({ ok: false, error: "读取失败" }, { status: 500 });
    }
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      const { roomId, data } = body;
      const jsonData = JSON.stringify(data);
      await env.DB.prepare("UPDATE rooms SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(jsonData, roomId).run();
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ ok: false, error: "保存失败" }, { status: 500 });
    }
  }
}
