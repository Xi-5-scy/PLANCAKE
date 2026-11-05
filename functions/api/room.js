export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  // 1. 创建新房间 (POST)
  if (method === 'POST') {
    try {
      const body = await request.json();
      // 生成 6 位随机邀请码 (例如: A1B2C3)
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      // 初始化空白数据
      const initialData = JSON.stringify(body.data || {});
      
      await env.DB.prepare("INSERT INTO rooms (id, data) VALUES (?, ?)")
        .bind(roomId, initialData).run();

      return Response.json({ ok: true, roomId });
    } catch (err) {
      return Response.json({ ok: false, error: "创建失败，请检查 D1 数据库是否建表" }, { status: 500 });
    }
  }

  // 2. 拉取房间数据 (GET)
  if (method === 'GET') {
    const url = new URL(request.url);
    const roomId = url.searchParams.get('id');
    if (!roomId) return Response.json({ ok: false, error: "缺少房间号" });

    try {
      const result = await env.DB.prepare("SELECT data FROM rooms WHERE id = ?")
        .bind(roomId).first();
      
      if (!result) return Response.json({ ok: false, error: "房间不存在" });
      return Response.json({ ok: true, data: JSON.parse(result.data) });
    } catch (err) {
      return Response.json({ ok: false, error: "读取失败" }, { status: 500 });
    }
  }

  // 3. 保存/更新房间数据 (PUT)
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const { roomId, data } = body;
      if (!roomId || !data) return Response.json({ ok: false, error: "参数缺失" });

      const jsonData = JSON.stringify(data);
      await env.DB.prepare("UPDATE rooms SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(jsonData, roomId).run();

      return Response.json({ ok: true });
    } catch (err) {
      return Response.json({ ok: false, error: "保存失败" }, { status: 500 });
    }
  }
}
