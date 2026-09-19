# Paperflow · 论文舒读

把双栏学术 PDF 转成单栏连续阅读页。纯本机处理，不上传、不摘要、不改写。第一版面向有文字层的论文。

**状态：v0.1.1，早期个人项目。** 已用 BERT 论文验证单栏阅读和 5 张附图；尚未覆盖各出版商版式，不保证任意 PDF 无损重排。

Paperflow is a local-first Chrome extension that reflows academic PDFs into a continuous, adjustable single-column reading view. It preserves source text and provides original-page comparison, inline figures and standalone HTML export. No account, API key or cloud conversion is required. OCR is not included yet.

## 安装：不需要写代码

在本仓库点击绿色 **Code → Download ZIP**，解压后按下列步骤选择其中的 `extension/` 文件夹。

1. 如果拿到的是 ZIP，先解压到一个长期保留的文件夹。
2. 在 Chrome 地址栏输入 `chrome://extensions`。
3. 打开右上角 **开发者模式**。
4. 点击 **加载已解压的扩展程序**，选择这个项目里的 **extension** 文件夹（里面直接有 `manifest.json`）。如果使用单独的安装 ZIP，则选择解压得到的 `paperflow-extension` 文件夹。
5. 在 Chrome 工具栏的拼图按钮里，把 **Paperflow · 论文舒读** 固定到工具栏。
6. 如果希望直接读取浏览器打开的本地 PDF：在扩展 **详情** 里开启 **允许访问文件网址**。也可直接在 Paperflow 中选择文件，无需开启该选项。

本项目已经附带完整的 `extension/`，无需运行 npm，也无需服务器或 API key。未发布到 Chrome Web Store。企业管理的浏览器可能禁止加载自行开发的扩展。

## 日常使用

- **网页论文**：打开 PDF 后点击 Paperflow 工具栏按钮。ACL 论文详情页也可以直接点击。其他网站首次可能出现“允许读取这个网站并重试”，只申请当前域名。
- **本地论文**：点击工具栏按钮进入阅读页，选择 **打开 PDF**，或拖入文件。已在 Chrome 打开的本地 PDF 可使用上述文件权限一键读取。
- **调整阅读**：左侧调字号、行距、正文宽度和配色，设置会记住。窄窗口自动收起设置。
- **顺序异常**：展开 **排版修正**，手动选双栏或单栏；可以恢复被隐藏的页眉和页脚。
- **公式／图表**：点段落旁的 **原页**，展开查看原始图像。带 Figure / Fig. / 图编号图注的附图现在会直接插入正文，包含矢量示意图、坐标轴和图例；无法定位时显示该图所在的完整原页。复杂表格请以原页为准。
- **保存**：点击 **保存 HTML**。导出包含全文、公式图像和全部原页，之后用浏览器离线打开即可。导出文件保留当前阅读样式；点击页码后展开对应原页。请只导出你有权保存的论文。

内容处理不经过服务器；访问网页 PDF 时，会向该 PDF 所在站点发出正常下载请求。偏好保存在本机，文件内容留在当前页面内存中，关闭阅读页后不再保留。导出的 HTML 是用户主动保存的副本。

## 目前做到什么

已实现：本地／网页 PDF、单栏重排、目录、段落恢复、重复页眉页脚清理、保守断词修复、公式原图回退、正文附图与完整图注、完整原页对照、独立 HTML 导出、可替换解析接口。

仍有限制：扫描件尚无 OCR；公式不是可编辑数学表达式；图表不自动转成语义 HTML；少数连字符、复杂表格及多行小节标题可能需要原页核对。全文不会被主动摘要或改写，但启发式提取无法保证所有 PDF 的顺序与文字完全正确。

## 开发

使用 Node.js 22.13+，首次安装依赖需要联网：

```sh
npm ci --ignore-scripts
npm run build
npm test
```

修改 `src/` 后重新构建，在 Chrome 扩展页点刷新，再重新打开阅读页。依赖被锁定在 `package-lock.json`；PDF.js 使用 Apache-2.0 许可证，打包副本位于 `extension/vendor/LICENSE`。本项目使用 MIT 许可证。

可选真实 PDF 检查：

```sh
npm run check:pdf -- /absolute/path/paper.pdf
```

结构：`src/background.js` 是工具栏入口；`src/parser.js` 是 PDF 适配器；`src/layout.js` 是纯重排算法；`src/reader.*` 是界面；`scripts/build.mjs` 将源文件和 PDF.js 资源复制为可加载扩展。

详细范围见 [MVP 规划](MVP.md)，验证记录见 [验证说明](VALIDATION.md)。

## 反馈问题

欢迎提交 Issue，注明扩展版本、Chrome 版本、PDF 页码和遇到的问题。有公开论文链接时请附上；不要上传含私人或保密内容的文档。文字顺序、图像裁切、公式以及可访问性问题都可以反馈。

## 0.1.1 附图修复

修复了旧版仅有图注、正文没有附图的问题。附图使用 PDF 原始区域渲染，既支持位图也支持矢量图。保存 HTML 时内嵌图片，不依赖临时链接。尚不保证无编号图注、图注在图上方或跨页附图的自动裁切。

若原来加载的是本项目的 `extension/`，在 Chrome 扩展管理页刷新 Paperflow，再重新打开 PDF 即可。若原来加载的是 ZIP 解压后的其他文件夹，先用新版安装包替换那个文件夹里的文件，再刷新扩展。确认版本显示为 **0.1.1**。
