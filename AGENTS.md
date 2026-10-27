# 项目规则

- 使用平实中文。每次协议结论必须有源码位置或硬件响应；明确区分模拟测试、API 发送完成、参数回读、实际执行。
- site/core/incott-original.js 为逐字抽取的历史代码，不直接编辑。新功能通过 adapter.js 与 studio.js 实现，不加载旧网页 DOM 或其后台写入队列。
- 页面加载/连接/刷新仅查询；用户修改形成草稿，明确点击写入才发送。不得把默认值冒充设备值。保留未知映射，不随意重置鼠标。
- 所有设备访问经过串行控制器。长操作必须有时限；超时后禁止新的调用，避免尚未结束的 USB 操作与重试重叠。
- 硬件实验必须先保存参数，try/finally 恢复，再逐项回读。不能将有线 G24 结果推广到 G23 或无线/8K 接收器。
- 研究、失败假设和修法持续写入 WORKLOG.md / PROTOCOL.md，原始证据放 evidence。被推翻的说法保留在“已推翻”条目，不删除历史。
- 修改 studio.html 后运行 python build-site.py，同步默认入口；原版 original.html 不重写。无外部 CDN、字体或遥测依赖。
- 提交前 npm test、JS 语法检查、浏览器交互与截图检查。发布后检查 Actions、HTTP 和实际 Pages 页面，不以 push 成功代表部署成功。

- 需要用户物理按键的测试，只在用户明确表示当前可配合时安排。用户未在线时保留待测，不反复发送配合请求，不临时改键等待用户。
- 用户没有其他鼠标可测试。协议重建和型号覆盖以可取得的原始网页驱动识别逻辑、命令及参数为依据；社区实现只作调查线索，不能据此扩展设备写入范围。缺少实机时标“原码覆盖，未实测”，不能把新增硬件验证当成用户必须完成的前置任务。
- 每小时 Issues 检查遵守 ISSUE_POLICY.md：作者为 Caldis 时直接实施、测试并发布；第三方只认 Caldis 本人添加的当前 codex:implement 标签，其他均等待。没有 codex:plan 策略，不自动评论或关闭 Issue。使用 .local/issue-monitor-state.json 防止重复处理。
- 产品名固定为“incott网页驱动”，标题、无障碍名称和文档保持一致。
- UI 子集字体更新必须改变请求 URL 的 sha256 缓存键，并同步 CSS 与 HTML preload。浏览器检查要核对实际字形使用的字体；只检查 font-family 或 document.fonts.check 不足以排除缺字回退。
- 多个已授权 HID 端口不能直接选数组第一项。自动连接优先上次成功端口、其次有线，只读探测失败后才能换端口；手动连接始终保留原生选择框。全零 DPI 响应不能当成默认配置，不能因此放开写入。
- 用户于 2026-10-27 要求关闭每小时检查；incott-issues 已停用，不得自行恢复。保留 ISSUE_POLICY.md 作为后续手动检查时的授权规则。
- 站点正式域名为 incott.caldis.me，Cloudflare CNAME 指向 caldis.github.io（DNS only）。Pages 使用 Actions 发布，自定义域名由 GitHub Pages 设置管理；官方说明此模式忽略 CNAME 文件，不添加无效的配置文件。发布后核对 DNS、证书、HTTPS 强制跳转和实际页面。
