# incott网页驱动

为 Incott G23 / G24 保存的网页驱动，以及重新设计的个人使用界面。保留原版 WebHID 通信、参数编码和宏编码器，不加载原版 UI 或自动写入流程。

新界面参考 NuPhyIO 的设备点选方式：点鼠标上的按键，在下方选择功能；DPI、性能和宏分别编辑。所有修改先成为草稿，点击“写入鼠标”后才发送。常规参数写后回读核对。

## 使用

- 在线：[打开incott网页驱动](https://incott.caldis.me/)。原 GitHub Pages 地址会跳转到这个域名。
- 本地：安装 Node.js 22 或以上，双击 `start.cmd`，或在本目录执行 `npm start`。打开 `http://127.0.0.1:8765/`。
- 使用桌面 Chrome / Edge，选择鼠标或接收器并授权。浏览器权限与网站地址绑定，从本地或旧域名切换时需要重新选择设备。
- 所有运行资源（包括中文字体）在 `site/`，无 CDN、无 API 服务、无 npm 运行依赖；下载后可断外网使用。不要直接双击 HTML 文件，使用本地 HTTP 地址。
- 参数写入后保存在鼠标，网页可以关闭。预设和宏库保存在当前浏览器；重要配置请导出 JSON 文件。
- 如需终端断线后继续运行，使用自己的 herdr 会话运行 `node server.cjs`。普通启动脚本在当前终端前台运行，关闭终端即停止。

完整型号状态和适合转发的说明见 [兼容性列表](COMPATIBILITY.md)。目前不能宣传为全部 Incott 鼠标通用。

## 功能与测试范围

| 功能 | 状态 |
|---|---|
| 六个按键、鼠标功能、键盘组合键、多媒体映射 | G24 有线写入/回读实测 |
| 六档 DPI、档数、当前档，50–32000 / 步进 50 | G24 有线实测；X/Y 同步 |
| 125 / 250 / 500 / 1000 Hz | G24 有线实测 |
| LOD、传感器模式、Motion Sync、波纹/直线修正、消抖 | G24 有线写入/回读实测 |
| 连发次数与间隔 | 参数写入/回读实测 |
| 宏录制、循环、保存、绑定、发送 | 编码/发送与槽位回读已测；实际执行结果见 evidence/macro-report.json |
| 本地预设、配置导入/导出、左右键交换、按键测试 | 浏览器交互测试 |
| G23 / 无线休眠 / 8K 接收器灯光和回报率 | 保留原协议，尚缺对应实机测试 |

有线 G24 接受高回报率命令后仍回读 1000 Hz，因此有线界面最高显示 1000 Hz。原版的独立 X/Y 写入在本次 G24 固件上没有产生独立轴结果，所以不提供没有被实测支持的分轴开关。

原版“4 个板载配置”实为电脑上的预设，新界面使用“本地预设”命名。原版配对按钮没有实现；没有固件升级文件，不提供这些空入口。完整命令、原版缺陷、被实验推翻的假设见 [PROTOCOL.md](PROTOCOL.md)。

## 反馈与维护

页面右上角有 [GitHub 仓库入口](https://github.com/Caldis/incott-driver) 和单独的 [问题反馈入口](https://github.com/Caldis/incott-driver/issues/new/choose)。每小时自动检查已停用；手动处理时的授权规则见 [ISSUE_POLICY.md](ISSUE_POLICY.md)。

## 开发与验证

```sh
npm test
node server.cjs
```

测试不需要安装依赖。`test/core.test.cjs` 验证原始核心完整性、编码、响应校验、串行访问和失败停止。`test/ui.browser.js` 通过 Playwright CLI 在模拟 HID 上验证界面，不操作用户设备。`test/hardware.browser.js` 为人工授权后的 G24 参数实验，**不要在未知设备或自定义配置上随意运行**；实验包含恢复步骤，结果保存在 `evidence/`。

站点的 `index.html` 与 `studio.html` 相同，修改界面后执行 `python build-site.py` 同步入口。原始协议类由 `python build-core.py` 从归档源码逐字抽取；修改适配层，不直接修改原始核心。

## 原始备份与来源

- 镜像：https://www.azuridayo.ca/incott-g23-g24-driver/
- 原镜像仓库：https://github.com/azuridayo/incott-g23-g24-driver
- 原始提交：`7b8a4387df20cb7c038b0d2901e7cad72e5873a9`
- `archives/upstream-original.zip`：原 Git 提交的文件归档。
- `archives/deployed-original.zip`：实际镜像站下载的 97 个文件，字节校验见 `download-manifest.json`。
- `site/original.html`：原版页面入口，相关原版脚本和图片保留在 `site/js`、`site/images`。
- `core-provenance.json`：核心抽取来源和 SHA-256。

感谢 Azuridayo 保存这份镜像。本项目不代表 Incott、镜像维护者或 NuPhy；没有复制 NuPhy 的程序或资源。原厂代码和原始素材的权利归原作者；本项目没有为这些文件重新授予开源许可。新增界面和适配代码许可见 `LICENSE`。
