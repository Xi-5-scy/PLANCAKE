const SESSION_DAYS = 30;
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers}});
const uid = () => crypto.randomUUID();
const bytesToHex = b => [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const randomHex = (n=32) => { const b=new Uint8Array(n); crypto.getRandomValues(b); return bytesToHex(b); };
const sha = async s => bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const cookie = (name,value,maxAge,secure=true) => `${name}=${value}; Path=/; HttpOnly; ${secure?'Secure; ':''}SameSite=Lax; Max-Age=${maxAge}; Expires=${new Date(Date.now()+maxAge*1000).toUTCString()}`;
function getCookie(req,name){ return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||''; }
async function body(req){ try{return await req.json()}catch{return null} }
async function passwordHash(password,salt){ const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']); const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256); return bytesToHex(bits); }
async function auth(req,env){ const token=getCookie(req,'pc_session'); if(!token)return null; const hash=await sha(token); const row=await env.DB.prepare('SELECT users.id,users.email,users.username,users.created_at FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').bind(hash,Math.floor(Date.now()/1000)).first(); return row||null; }
async function requireUser(req,env){ const user=await auth(req,env); return user; }
async function getPlan(env,userId){ return env.DB.prepare('SELECT p.* FROM plans p JOIN plan_members m ON m.plan_id=p.id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND (u.active_plan_id=p.id OR u.active_plan_id IS NULL) ORDER BY p.updated_at DESC LIMIT 1').bind(userId).first(); }
async function canAccess(env,planId,userId){ return env.DB.prepare('SELECT role FROM plan_members WHERE plan_id=? AND user_id=?').bind(planId,userId).first(); }
function corsHeaders(req,env){ const origin=req.headers.get('Origin')||''; const allowed=env.APP_ORIGIN||origin; return {'access-control-allow-origin': origin===allowed?origin:allowed,'access-control-allow-credentials':'true','vary':'Origin'}; }
export default { async fetch(req,env){
 const url=new URL(req.url), path=url.pathname, method=req.method;
 if(method==='OPTIONS') return new Response(null,{headers:{...corsHeaders(req,env),'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'Content-Type'}});
 try {
  if(path==='/api/health') return json({ok:true,service:'PlanCake API'});
  if(path==='/api/auth/register'&&method==='POST'){
   const b=await body(req); if(!b||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email||'')||typeof b.username!=='string'||b.username.trim().length<2||typeof b.password!=='string'||b.password.length<10) return json({error:'请填写有效邮箱、至少2个字符的用户名和至少10位密码。'},400);
   const email=b.email.trim().toLowerCase(), id=uid(), salt=randomHex(16), hash=await passwordHash(b.password,salt);
   try{ await env.DB.prepare('INSERT INTO users(id,email,username,password_hash,password_salt) VALUES(?,?,?,?,?)').bind(id,email,b.username.trim().slice(0,40),hash,salt).run(); }catch(e){return json({error:'这个邮箱已经注册过了。'},409)}
   const planId=uid(); await env.DB.prepare('INSERT INTO plans(id,owner_id,title,data) VALUES(?,?,?,?)').bind(planId,id,'我的旅行规划','{}').run(); await env.DB.prepare('INSERT INTO plan_members(plan_id,user_id,role) VALUES(?,?,?)').bind(planId,id,'owner').run(); await env.DB.prepare('UPDATE users SET active_plan_id=? WHERE id=?').bind(planId,id).run();
   const token=randomHex(32), expires=Math.floor(Date.now()/1000)+SESSION_DAYS*86400; await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),id,expires).run();
   return json({ok:true,user:{id,email,username:b.username.trim()},planId},201,{ 'set-cookie':cookie('pc_session',token,SESSION_DAYS*86400,new URL(req.url).protocol==='https:'), ...corsHeaders(req,env)});
  }
  if(path==='/api/auth/login'&&method==='POST'){
   const b=await body(req); if(!b?.email||!b?.password)return json({error:'请输入邮箱和密码。'},400);
   const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(b.email.trim().toLowerCase()).first(); if(!u||await passwordHash(b.password,u.password_salt)!==u.password_hash)return json({error:'邮箱或密码不正确。'},401);
   const token=randomHex(32), expires=Math.floor(Date.now()/1000)+SESSION_DAYS*86400; await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha(token),u.id,expires).run(); return json({ok:true,user:{id:u.id,email:u.email,username:u.username}},200,{'set-cookie':cookie('pc_session',token,SESSION_DAYS*86400,new URL(req.url).protocol==='https:'),...corsHeaders(req,env)});
  }
  if(path==='/api/auth/logout'&&method==='POST'){ const token=getCookie(req,'pc_session'); if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha(token)).run(); return json({ok:true},200,{'set-cookie':cookie('pc_session','',0,new URL(req.url).protocol==='https:'),...corsHeaders(req,env)}); }
  if(path==='/api/auth/me'&&method==='GET'){ const u=await auth(req,env); if(!u)return json({user:null}); return json({user:u}); }
  if(path==='/api/profile'&&(method==='GET'||method==='PUT')){
   const user=await requireUser(req,env); if(!user)return json({error:'请先登录。'},401);
   if(method==='PUT'){const b=await body(req);const username=String(b?.username||'').trim(),bio=String(b?.bio||'').trim(),avatar=String(b?.avatar||'');if(username.length<2||username.length>40||bio.length>300||avatar.length>700000|| (avatar&&!/^data:image\/(png|jpeg|webp|gif);base64,/.test(avatar)))return json({error:'资料格式不正确：昵称 2-40 字，简介不超过 300 字，头像需为 500KB 内图片。'},400);await env.DB.prepare('UPDATE users SET username=?,profile_bio=?,profile_avatar=? WHERE id=?').bind(username,bio,avatar,user.id).run();}
   const profile=await env.DB.prepare('SELECT id,email,username,profile_avatar,profile_bio,created_at FROM users WHERE id=?').bind(user.id).first();return json({profile});
  }
  const user=await requireUser(req,env); if(!user)return json({error:'请先登录。'},401);
  if(path==='/api/plans'&&method==='GET'){const r=await env.DB.prepare('SELECT p.id,p.owner_id,p.title,p.data,p.version,p.updated_at,pm.role FROM plans p JOIN plan_members pm ON pm.plan_id=p.id WHERE pm.user_id=? ORDER BY p.updated_at DESC').bind(user.id).all();return json({plans:r.results||[]});}
  if(path==='/api/plans'&&method==='POST'){const b=await body(req),title=String(b?.title||'').trim();if(!title||title.length>80)return json({error:'规划标题需为 1-80 个字符。'},400);const id=uid();await env.DB.prepare('INSERT INTO plans(id,owner_id,title,data) VALUES(?,?,?,?)').bind(id,user.id,title,JSON.stringify(b.data||{})).run();await env.DB.prepare('INSERT INTO plan_members(plan_id,user_id,role) VALUES(?,?,?)').bind(id,user.id,'owner').run();await env.DB.prepare('UPDATE users SET active_plan_id=? WHERE id=?').bind(id,user.id).run();return json({ok:true,id},201);}
  if(path.startsWith('/api/plans/')&&path.endsWith('/select')&&method==='POST'){const id=path.split('/')[3],m=await canAccess(env,id,user.id);if(!m)return json({error:'无权访问该规划。'},403);await env.DB.prepare('UPDATE users SET active_plan_id=? WHERE id=?').bind(id,user.id).run();return json({ok:true});}
  if(path.startsWith('/api/plans/')&&method==='DELETE'&&!path.endsWith('/current')){const id=path.split('/')[3],p=await env.DB.prepare('SELECT owner_id FROM plans WHERE id=?').bind(id).first();if(!p||p.owner_id!==user.id)return json({error:'只有创建者可以删除规划。'},403);await env.DB.prepare('DELETE FROM plans WHERE id=?').bind(id).run();const next=await env.DB.prepare('SELECT plan_id FROM plan_members WHERE user_id=? LIMIT 1').bind(user.id).first();await env.DB.prepare('UPDATE users SET active_plan_id=? WHERE id=?').bind(next?.plan_id||null,user.id).run();return json({ok:true});}
  if(path==='/api/plans/current'&&method==='GET'){
   let p=await getPlan(env,user.id); if(!p){const id=uid(); await env.DB.prepare('INSERT INTO plans(id,owner_id,title,data) VALUES(?,?,?,?)').bind(id,user.id,'我的旅行规划','{}').run(); await env.DB.prepare('INSERT INTO plan_members(plan_id,user_id,role) VALUES(?,?,?)').bind(id,user.id,'owner').run(); await env.DB.prepare('UPDATE users SET active_plan_id=? WHERE id=?').bind(id,user.id).run(); p=await getPlan(env,user.id)}
   const members=await env.DB.prepare('SELECT u.id,u.username,u.email,m.role,m.joined_at FROM plan_members m JOIN users u ON u.id=m.user_id WHERE m.plan_id=?').bind(p.id).all(); return json({plan:{id:p.id,title:p.title,data:JSON.parse(p.data||'{}'),version:p.version,updatedAt:p.updated_at},members:members.results||[]});
  }
  if(path==='/api/plans/current'&&method==='PUT'){
   const b=await body(req); if(!b||typeof b.data!=='object')return json({error:'规划数据格式不正确。'},400); const p=await getPlan(env,user.id); if(!p)return json({error:'找不到旅行规划。'},404);
   const result=await env.DB.prepare('UPDATE plans SET data=?,version=version+1,updated_at=datetime(\'now\') WHERE id=? AND version=?').bind(JSON.stringify(b.data),p.id,Number(b.version)||p.version).run();
   if(!result.meta.changes){const latest=await env.DB.prepare('SELECT version,data FROM plans WHERE id=?').bind(p.id).first();return json({conflict:true,version:latest.version,data:JSON.parse(latest.data)},409)}
   const updated=await env.DB.prepare('SELECT version,updated_at FROM plans WHERE id=?').bind(p.id).first(); return json({ok:true,version:updated.version,updatedAt:updated.updated_at});
  }
  if(path==='/api/invites'&&method==='POST'){
   const p=await getPlan(env,user.id); if(!p)return json({error:'找不到规划。'},404); const code='PC-'+randomHex(2).toUpperCase()+'-'+randomHex(3).toUpperCase(); const expires=Math.floor(Date.now()/1000)+86400; await env.DB.prepare('INSERT INTO invites(code_hash,plan_id,created_by,expires_at) VALUES(?,?,?,?)').bind(await sha(code),p.id,user.id,expires).run(); return json({ok:true,code,expiresAt:expires,uses:1});
  }
  if(path==='/api/invites/join'&&method==='POST'){
   const b=await body(req); const code=String(b?.code||'').trim().toUpperCase(); if(!/^PC-[A-F0-9]{4}-[A-F0-9]{6}$/.test(code))return json({error:'邀请码格式不正确。'},400);
   const h=await sha(code), inv=await env.DB.prepare('SELECT * FROM invites WHERE code_hash=?').bind(h).first(); if(!inv||inv.used_by||inv.expires_at<Math.floor(Date.now()/1000))return json({error:'邀请码无效、已使用或已过期。'},410);
   const used=await env.DB.prepare('UPDATE invites SET used_by=?,used_at=datetime(\'now\') WHERE code_hash=? AND used_by IS NULL AND expires_at>?').bind(user.id,h,Math.floor(Date.now()/1000)).run(); if(!used.meta.changes)return json({error:'邀请码已被其他人使用。'},410);
   await env.DB.prepare('INSERT OR IGNORE INTO plan_members(plan_id,user_id,role) VALUES(?,?,?)').bind(inv.plan_id,user.id,'editor').run(); await env.DB.prepare('UPDATE users SET active_plan_id=? WHERE id=?').bind(inv.plan_id,user.id).run(); return json({ok:true,message:'已加入共享旅行规划。'});
  }
  if(path==='/api/plans/members'&&method==='GET'){
   const p=await getPlan(env,user.id); if(!p)return json({members:[]}); const m=await env.DB.prepare('SELECT u.id,u.username,u.email,pm.role,pm.joined_at FROM plan_members pm JOIN users u ON u.id=pm.user_id WHERE pm.plan_id=?').bind(p.id).all(); return json({members:m.results||[]});
  }
  if(path.startsWith('/api/plans/members/')&&method==='DELETE'){
   const memberId=path.split('/').pop(), p=await getPlan(env,user.id); if(!p||p.owner_id!==user.id)return json({error:'只有规划创建者可以移除成员。'},403); if(memberId===user.id)return json({error:'不能移除创建者本人。'},400); await env.DB.prepare('DELETE FROM plan_members WHERE plan_id=? AND user_id=?').bind(p.id,memberId).run(); return json({ok:true});
  }
  return json({error:'Not found'},404);
 }catch(e){ return json({error:'服务器暂时无法处理请求。',detail:env.ENVIRONMENT==='development'?String(e):undefined},500); }
}}

