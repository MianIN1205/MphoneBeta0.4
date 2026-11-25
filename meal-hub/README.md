# 大锅饭兑换服务

独立部署此 Worker。眠花糖机仍由原来的网页提供界面。部署前在 Wrangler 配置里将 MEAL_ORIGIN 设为实际网页的 origin 并在 MEAL_PROVIDERS 配置上线前核对过的 OpenAI 兼容服务商。值的结构例如：

```json
{"example":{"name":"示例服务商","url":"https://api.example.com/v1"}}
```

服务商地址不应带查询参数、账号、密钥或末尾的 chat/completions。已发出的码通过服务商 ID 查找上游，因此不要将已有 ID 重新指向另一家服务商。

用 Cloudflare 账号运行 `npx wrangler secret put MEAL_SECRET` 写入至少 32 字符的随机秘密，再运行 `npx wrangler deploy`。保持该秘密稳定，否则旧兑换码加密的 Key 无法继续使用。部署后把 Worker 的 HTTPS 地址填进 index.html 的 mphone-meal-service 元标签，按项目惯例升级网页缓存版本后发布。仓库不需要保存任何真实密钥。

开发时可用 `npx wrangler dev`，将 MEAL_ORIGIN 临时设置为本地网页 origin。配置先使用模拟服务商验证领用和计次。

按真实上游尝试计次，包括已转发后收到错误的请求。额度按兑换码和领取凭证在 Durable Object 中扣减。浏览器只保存可撤销的领用凭证，恢复整机备份时不会恢复凭证。每次分享使用独立且在服务商侧限额的子密钥。首版支持聊天端点和模型列表。
