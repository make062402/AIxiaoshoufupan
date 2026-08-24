# T52 域名与 HTTPS

## 已确认范围

- 根域名：`woshimake.com`
- 专用子域名：`xiaoshoufupan.woshimake.com`
- 目标 IPv4：`8.134.128.117`
- 权威 DNS：Cloudflare（`felipe.ns.cloudflare.com`、`hadlee.ns.cloudflare.com`）
- 本任务只新增上述子域名，不修改根域名、`www` 或其他现有记录
- 当前没有公网 IPv6，因此不新增 AAAA 记录
- T52 只发布占位页；React/Hono/SQLite 的正式部署属于 T53

只读检查时，Google Public DNS 对目标子域名返回 NXDOMAIN，证明操作前没有同名 A 记录。2026-08-23 已按下表新增记录，未改动根域名现有 Worker 记录。

## Cloudflare DNS

在 Cloudflare 的 `woshimake.com` 区域新增：

| 类型 | 名称 | IPv4 地址 | 代理状态 | TTL |
|---|---|---|---|---|
| A | `xiaoshoufupan` | `8.134.128.117` | 仅 DNS（灰云） | 自动 |

保持“仅 DNS”可以让签发和浏览器验收直接命中本机 Nginx。不要删除、覆盖或批量导入其他记录。

## 安装与签发

DNS 公共解析已指向目标 IP、阿里云安全组已允许入方向 TCP 443 后，在服务器仓库目录以 `root` 执行：

```bash
chmod +x ops/configure-https.sh ops/check-https.sh
./ops/configure-https.sh
```

脚本会：

1. 先确认目标域名确实解析到 `8.134.128.117`；
2. 安装 Ubuntu 官方 Certbot 与 Nginx 插件；
3. 发布独立的 T52 占位页和 HTTP 站点；
4. `nginx -t` 通过后才 reload，失败则恢复原配置；
5. 通过 Let's Encrypt 签发证书并配置 HTTP→HTTPS；
6. 启用 `certbot.timer` 并执行 `certbot renew --dry-run`。

脚本默认不向 Let's Encrypt 提交联系邮箱。若要接收续期提醒，可显式传入邮箱；该邮箱会发送给 Let's Encrypt：

```bash
CERTBOT_EMAIL='你的邮箱' ./ops/configure-https.sh
```

证书、私钥和 Certbot 账号数据只保存在服务器 `/etc/letsencrypt`，不得复制到仓库。

## 验收

命令检查：

```bash
./ops/check-https.sh
systemctl is-active certbot.timer
systemctl is-enabled certbot.timer
certbot certificates
```

浏览器必须分别验证：

1. 打开 `https://xiaoshoufupan.woshimake.com/`，看到“AI 销售复盘助手”占位页；
2. 地址栏显示受信任 HTTPS，证书域名包含 `xiaoshoufupan.woshimake.com`；
3. 打开 `http://xiaoshoufupan.woshimake.com/`，最终地址自动变为 HTTPS；
4. 根域名 `woshimake.com` 与既有站点不受影响。

## 2026-08-23 实际执行结果

- Cloudflare 已新增 A 记录 `xiaoshoufupan -> 8.134.128.117`，状态为“仅 DNS”；没有新增 AAAA。
- 阿里云安全组 `sg-7xv7nip6gi2sh69lcjcl` 已新增允许入方向 `TCP HTTPS(443)`、来源 `0.0.0.0/0`、优先级 1；原有规则保留，规则总数由 5 变为 6。
- Ubuntu 官方源已安装 Certbot 与 Nginx 插件；部署命令通过阿里云云助手返回“成功执行”。脚本在 reload 前执行 `nginx -t`，并启用 `certbot.timer`、完成 `certbot renew --dry-run`。
- 证书由 Let's Encrypt `YR2` 签发，CN 与 SAN 都是 `xiaoshoufupan.woshimake.com`；有效期为 2026-08-24 03:54:42 UTC 至 2026-11-22 03:54:41 UTC，OpenSSL 返回 `Verify return code: 0 (ok)`。
- 公网请求结果：HTTP 返回 `301 Moved Permanently` 且 Location 指向 HTTPS；HTTPS 返回 `200 OK`。Safari 地址栏为受信任 HTTPS，并显示 T52 占位页。
- 服务器端再次执行 `nginx -t`、Nginx active/enabled、Certbot timer active/enabled 和 `ops/check-https.sh`，云助手返回“成功执行”。
- `https://woshimake.com/` 仍返回 200，原根域名网站未被覆盖。

macOS 自带 curl 使用 LibreSSL，在当前本机网络上偶发 TLS 握手兼容问题；检查脚本因此用 OpenSSL 直接连接已确认的源站 IP，并继续以子域名做 SNI 和证书校验。浏览器、Node HTTPS、OpenSSL 和服务器端脚本均独立通过。
