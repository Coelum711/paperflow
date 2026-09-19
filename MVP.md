# Paperflow MVP

目标：让读者从学术 PDF 直接进入低负担、单栏、连续的原文阅读。优先处理 ACL 一类有文字层的双栏论文。保持原语言，不总结、不翻译、不生成新内容。

## 范围与验收

| 需求 | 第一版实现 | 边界 |
| --- | --- | --- |
| 一键转换 | Chrome 工具栏按钮打开当前网页／本地 PDF；ACL 论文详情页自动换成 PDF 地址 | 其他站点首次可能需要授权；内嵌／blob PDF 请下载后打开 |
| 本地文件 | 文件选择、拖放、file URL | file URL 需要 Chrome 的文件访问开关；文件选择不需要 |
| 结构保留 | 文字坐标恢复行、单双栏排序、启发式标题和段落、引用原文 | 不是完美语义解析；图表内部文字可能仍零散 |
| 减少视觉障碍 | 单栏、16–32px 字号、1.3–2.5 行距、480–1000px 宽度、三种配色、目录和键盘焦点 | 设置保存在本机；不保存论文内容 |
| 版式清理 | 重复页眉／页脚、页码、ACL 首页出版页脚、连续断行、可确认的断词 | 不确定连字符保留，避免破坏复合术语；可关闭边缘清理 |
| 公式与图表 | 可识别公式以局部原图呈现；图表说明保留；每段可跳回完整原页 | 不转 LaTeX／MathML；0.1.1 已加入带编号图注的附图裁切；不承诺所有版式或表格语义恢复 |
| HTML 输出 | 导出独立 HTML，内嵌公式和全部原页图像 | 保存当前样式；无动态设置面板；长文导出较慢、较大 |
| 可替换解析器 | `PdfJsParser.open()` 文档接口 | OCR 和高精度版面模型尚未接入 |

## 处理路线

PDF 字节 → 本地 PDF.js worker → 页内文字坐标 → 同行片段与窄栏间隙 → 按跨栏标题分区 → 左栏／右栏排序 → 标题、段落、说明、公式块 → 安全 HTML 渲染。

每块保留原页号与矩形区域。PDF 原文通过 `textContent` 插入，不作为 HTML 执行。PDF 中的 JavaScript 不执行。所有脚本、字体映射和 worker 都打包在扩展里；没有远程执行代码或云端转换。

## 后续接口

替换 `src/parser.js` 中的解析器，保持以下契约：

```js
const doc = await parser.open(bytes, {onProgress(current, total) {}});
doc.pages; // [{number, width, height, lines}]
doc.reflow({mode: 'auto', removeMargins: true});
// -> {blocks: [{type, text, page, sourcePages?, column, box}], removed, warnings}
await doc.renderPage(pageNumber, canvas);
await doc.renderRegion(pageNumber, [left, top, right, bottom], canvas);
await doc.destroy();
```

`box` 使用 scale=1 的 PDF.js viewport 坐标。未来可加入本机 OCR、区域置信度、图表裁剪和多栏检测；若增加云端解析，必须先提供单独的上传说明和用户主动选择。阅读页不应因切换解析器而重新设计。

## 当前限制

- 优先英语、从左到右、有文字层的单栏／常规双栏论文；不保证复杂混合版面、旋转文字、RTL 的正确阅读顺序。
- 扫描页只提示需要 OCR，保留原页；损坏文字映射不一定能自动检测。
- 标题是推断的，可能误认或漏认；多行小节标题可能拆成标题加正文。
- 断词仅使用全文词形证据和软连字符处理，不会为了连贯而猜测拼写。
- 0.1.1 将可定位的附图与完整图注插入正文，去掉图内文字在正文中的重复片段。复杂表格可能仍以零散文字出现；原页图像是完整保真来源。
- 页面提取、公式渲染和导出按序进行；80 MB 为文件上限，并非性能保证。暂未加入取消按钮及分批虚拟滚动。
- 加密 PDF 请先解锁；登录墙、跨域重定向或服务器拒绝访问时，请下载后打开。

## 依据

- [Chrome activeTab 权限](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome Manifest 文档](https://developer.chrome.com/docs/extensions/reference/manifest)
- [PDF.js 官方 API](https://mozilla.github.io/pdf.js/api/)
