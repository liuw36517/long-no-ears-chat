# 龙没有耳朵 · 通讯

这是一个可以直接部署到 GitHub Pages 的静态聊天网页。网页文件由 GitHub Pages 提供，账号、会话、消息和实时同步由 Supabase 提供。

## 已包含的功能

- 邮箱密码注册与登录
- 自动创建用户资料与显示名称
- 公共聊天会话列表
- 新建会话
- 消息发送、换行、表情选择
- Supabase Realtime 实时消息同步
- 消息搜索、会话搜索
- 深色/浅色主题
- 移动端响应式布局
- Supabase Row Level Security（RLS）数据库策略

## 第一次配置

### 1. 创建 Supabase 项目

在 Supabase 创建一个项目，然后打开 **SQL Editor**，完整复制并执行本目录的 `supabase.sql`。

脚本会创建 `profiles`、`rooms`、`room_members`、`messages` 四张表，配置登录后的访问策略，并把 `messages` 加入 Realtime 发布列表。

### 2. 配置邮箱登录

打开 Supabase 的 **Authentication → Providers → Email**，确认 Email provider 已启用。为了本地快速测试，可以暂时关闭 Confirm email；正式使用建议保留邮箱验证。

### 3. 填入浏览器公开配置

在 Supabase 的项目设置中复制 Project URL 和 **Publishable key/anon key**，填入 `config.js`：

```js
window.CHAT_CONFIG = {
  supabaseUrl: "https://你的项目.supabase.co",
  supabaseAnonKey: "你的_publishable_或_anon_key",
  appName: "龙没有耳朵 · 通讯"
};
```

只能放 Publishable/anon key。**不要把 `service_role` key 放进网页或 GitHub。** 数据库安全依赖已经写入 SQL 的 RLS 策略。

### 4. 配置 Supabase URL allow list

部署后，将 GitHub Pages 地址加入 Supabase **Authentication → URL Configuration** 的 Site URL 和 Redirect URLs，例如：

```text
https://你的用户名.github.io/你的仓库名/
```

如果你启用了邮箱验证，验证邮件中的跳转地址也需要在这个列表中。

## 部署到 GitHub Pages

### 用 Git 命令上传

```bash
git init
git add .
git commit -m "build: add realtime static chat"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

仓库中已经放好了 `.github/workflows/pages.yml`。在 GitHub 仓库的 **Settings → Pages** 将 Source 设为 **GitHub Actions**，之后每次推送到 `main` 都会自动部署。

也可以直接在 GitHub 网页中上传 `index.html`、`styles.css`、`config.js`、`app.js`、`supabase.sql`、`README.md` 和 `.github/workflows/pages.yml`。

## 常见问题

### 登录后提示 `relation does not exist`

说明 `supabase.sql` 没有完整执行。重新打开 SQL Editor，确认四张表都已创建。

### 登录后看不到会话或发送失败

检查：

1. 当前用户确实已经登录；
2. SQL 中的 RLS、grant 和 policies 已全部执行；
3. `config.js` 使用的是当前 Supabase 项目的 URL 和 Publishable/anon key；
4. `messages` 已在 Database → Publications → `supabase_realtime` 中启用。

### 注册后没有立即进入

如果 Supabase 开启了 Confirm email，需要先点击验证邮件，再回到网页登录。这是 Supabase 的正常认证流程。

## 安全边界

这是一个前端直连 Supabase Data API 的静态站点。浏览器中只能出现公开 key；任何需要保密的逻辑、管理员操作或第三方 API 密钥都必须放到服务端/Edge Function，不能放在 GitHub Pages 的 JavaScript 里。
