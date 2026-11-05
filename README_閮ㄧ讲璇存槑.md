# PlanCake-AI 2.0 部署说明

本版本保留原 PlanCake-AI 1.1 页面，并加入：邮箱+密码注册/登录、Cloudflare D1 云端规划保存、一次性邀请码（24小时有效且仅可成功使用一次）、共享规划编辑与约4秒轮询同步。

## 重要说明
- 当前版本使用 Cloudflare Pages Functions + D1；不要只上传 index.html，必须把本文件夹内的全部文件放进 GitHub 仓库根目录。
- 账号密码使用 PBKDF2-SHA256（210,000 次迭代）派生保存，登录使用 HttpOnly/Secure/SameSite=Lax Cookie。
- 本版本没有邮件验证、邮件找回密码功能；邮箱用于账号登录。以后可接入邮件服务商补上验证和找回流程。
- 多人同步采用 D1 版本号 + 4 秒轮询，不是毫秒级 WebSocket 实时协作；并发修改出现版本冲突时不会静默覆盖，需刷新后重试。
- 原有 /api/parse、/api/inspire AI 接口并未包含在此后端中；原页面会继续使用自身已有的降级文案逻辑。若需要真正 AI 行程生成，还需配置 AI API。
- 头像若以较大的 Base64 图片保存，可能导致 D1 记录过大，建议后续改为 Cloudflare R2 图片存储。

## 1. 创建 D1 数据库
1. 登录 Cloudflare 控制台，进入 Workers & Pages → D1 SQL Database。
2. 创建数据库，名称填写 `plancake-db`。
3. 打开数据库的 Console，把 `schema.sql` 全部内容粘贴执行。
4. 复制数据库的 Database ID。

## 2. 绑定数据库
打开 `wrangler.toml`，把 `database_id` 的中文占位文字替换成刚复制的 Database ID。

## 3. 上传 GitHub
将此文件夹中的全部内容（包括 `functions`、`src`、`schema.sql`、`wrangler.toml` 和 `public/index.html`）上传到 `Xi-5-scy/PLANCAKE` 仓库根目录。注意不是只替换 index.html。

## 4. Cloudflare Pages 设置
1. 打开 Workers & Pages → 你的 Pages 项目。
2. 确认 GitHub 仓库仍连接 `Xi-5-scy/PLANCAKE`。
3. Build command 留空，Build output directory 填 `public`（如果项目已使用其他构建设置，以 Pages 项目实际构建方式为准）。
4. 在 Pages 项目的 Settings → Bindings → D1 database bindings 中添加绑定：Variable name 填 `DB`，Database 选择 `plancake-db`。
5. 保存后重新部署最新 Git 提交。

## 5. 测试
部署完成后打开网站：
- 点击右上角“登录 / 注册”，注册一个账号。
- 在另一浏览器或无痕窗口注册第二个账号。
- 账号 A 生成邀请码；账号 B 登录后输入邀请码。
- A、B 应进入同一份规划；一方修改并保存后，另一方约 4 秒内看到更新。

## API
- POST `/api/auth/register` `{email, username, password}`
- POST `/api/auth/login` `{email, password}`
- POST `/api/auth/logout`
- GET `/api/auth/me`
- GET/PUT `/api/plans/current`
- POST `/api/invites`
- POST `/api/invites/join` `{code}`
- GET `/api/plans/members`
- DELETE `/api/plans/members/:userId`
