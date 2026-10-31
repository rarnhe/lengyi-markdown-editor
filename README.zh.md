<div align="center">

# Markdown 编辑器

一款在浏览器里「即开即用」的 Markdown 写作工具。<br>
**无安装、无账号、无订阅，你的文字只属于你。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)[![纯前端](https://img.shields.io/badge/Architecture-Pure%20Frontend-success)](./markdown-editor.html)[![多语言](https://img.shields.io/badge/I18N-10%20Languages-orange)](./i18n.js)

<p align="center">
  <a href="./README.md" style="display:inline-block;padding:6px 18px;background:#f3f4f6;color:#4b5563;border-radius:6px 0 0 6px;text-decoration:none;font-weight:600;">English</a>  |  <a href="./README.zh.md" style="display:inline-block;padding:6px 18px;background:#4f46e5;color:#fff;border-radius:0 6px 6px 0;text-decoration:none;font-weight:600;">简体中文</a>
</p>

</div>


---

## 🌟 为什么做这个工具？

AI 时代，Markdown 这件事，本该足够简单。

作为一个喜欢死磕 Prompt、Agent、Skills 的 Vibe Coding 开发者，我用过太多的 Markdown 工具：有的太重，有的订阅太贵，有的动不动就云端同步你的内容。我只想打开浏览器，输入文字，看到排版，然后把它带走。

于是有了这个编辑器。

它只有**一个 HTML 文件**。双击打开就能写，所有数据都存在本地，断网也能继续。它几乎支持 Codex、Claude Code、Openclaw 等市面上所有的 Agent，无论是 AGENTS.md 还是 Skill.md，你都可以通过它完成设计。

> 如果你也相信：AI 时代，markdown 就是第一语言。欢迎你来用、来改、来 Star。

---

## ✨ 功能特性

### 🚀 即开即用，极简使用

- 单文件 `markdown-editor.html`，双击即可在浏览器中运行。
- 所有核心样式、结构、逻辑内联在 HTML 中，离线也能使用。

### 🖊️ 完整的 Markdown 体验
- **拖拽导入**：直接把文件拖进来。
- **实时预览**：左侧写作，右侧同步预览。
- **浏览器宽度自适应工具栏**：编辑格式与 Mermaid 之后依次是**导入、导出、网页转 MD、视图、帮助、夜间／日间**。根据实际宽度自动将右侧操作收纳到 ⋮，格式工具与 ⋮ 保持同一行；已移除工具栏语言按钮和“清空”操作，保留 Ctrl+S、Ctrl+F 快捷键。
- **标准布局与阅读模式**：默认显示编辑、预览和大纲栏；「视图 → 阅读模式」隐藏工具栏与编辑区，以全宽预览配合可拖动浮动大纲阅读，使用浮窗内「退出阅读模式」按钮或 Esc 恢复。
- **居中文件名与底部状态栏**：预览栏顶部只显示**可编辑文件名**，居中且不超过渲染正文的左右边界。左下角依次为**预览可见底部进度百分比、渲染后字数统计、当前语言名称**，进度滑到底显示 100%；点击语言名称可切换语言。浏览器标签页显示“文件名-导入时间”（导入 Markdown 时）或“文件名-打开时间”（其他情况）；自动保存、手动保存及导出不会改变该时间。更名后按 Enter 或失焦仍会按新文件名下载 Markdown（Esc 可取消）。
- **Base64 折叠**：只有文档确实包含内嵌 Base64 图片时才显示并启用“显示／隐藏 Base64”按钮；删除图片后按钮自动消失，不影响右侧实时预览。
- **拖拽分栏与独立滚动**：拖动分隔线调整两栏宽度；收缩编辑栏时与大纲栏一样隐藏内部可滚动内容，避免残留滚动条；鼠标滚轮、触控板和直接拖动任一滚动条都触发另一栏的动作联动；增量按两栏到当前滚动方向边界的剩余距离比例调整，以便同时抵达顶部或底部，中途仍可维持不同的独立滚动位置。点击大纲标题时，无论 Base64 图片数据处于折叠还是展开状态，都按编辑栏实际换行高度定位标题：展开时使用原生 textarea 测量，避免多张图片后的位置偏差；编辑栏和预览栏的对应标题均置顶。

### 🛠️ 丰富的编辑工具

| 功能 | 说明 |
|------|------|
| 标题 | H1-H6 快速插入 |
| 文本样式 | 加粗、斜体、下划线、删除线、上标、下标 |
| 列表 | 无序列表、有序列表、任务列表 |
| 引用与代码 | 引用块、行内代码、代码块；围栏代码块右上角可显示语言标签，未指定语言时默认为空 |
| 链接与图片 | 点击链接或 Ctrl+K 打开统一弹窗；选中文字自动预填，无选中时默认“链接”，下方填写 URL。图片仍可插入 URL 或本地 Base64 |
| 表格 | 可视化 8×8 表格选择器 |
| 查找替换 | 支持查找下一个、替换、全部替换 |

### 🌐 多语言支持（10 种语言）

内置 `i18n.js`，支持：**简体中文、繁体中文、English、日本語、한국어、Español、Français、Deutsch、Русский、Português**。

语言状态会持久化到 `localStorage`，下次打开自动沿用。

### 🎨 深色 / 浅色主题

- 一键切换深色/浅色模式，主题偏好自动保存。
- 所有颜色使用 CSS 变量定义，扩展或覆盖都非常方便。

### 💾 本地自动保存

- 编辑器每 500ms 自动保存内容到浏览器 `localStorage`；编辑框获得输入焦点时，Ctrl/Cmd+S 触发当前 Markdown 下载，在其它区域不会拦截该快捷键。浏览器是否弹出“另存为”及如何处理同名文件取决于下载设置，不能强制覆盖原文件。
- 意外关闭、刷新页面，内容都会自动恢复。
- 文件名、分栏比例、折叠状态、主题、语言等偏好也会一并记忆。

### 📤 多格式导出

| 格式 | 说明 |
|------|------|
| `.md` | 原始 Markdown 文件 |
| `.html` | 独立 HTML 文件，可直接在浏览器打开 |
| `.doc` | Word 文档（可直接在 office 里打开） |
| `.pdf` | 调用浏览器，打印为 PDF |
| `.png` | 长图导出，支持 9:16、4:5、3:4、1:1、16:9 多种比例，适合小红书、公众号、Instagram 分享 |

### ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + S` / `Cmd + S` | 焦点位于编辑栏时下载当前 Markdown（沿用文件名；是否覆盖同名文件由浏览器决定） |
| `Ctrl + Z` | 撤销 |
| `Ctrl + Y` / `Ctrl + Shift + Z` | 重做 |
| `Ctrl + B` | 加粗 |
| `Ctrl + I` | 斜体 |
| `Ctrl + U` | 下划线 |
| `Ctrl + K` | 插入链接 |
| `Ctrl + Shift + K` | 插入图片 |
| `Ctrl + F` | 查找替换 |
| `Tab` | 插入 4 空格缩进 |

---

## 🛠️ 技术架构

### 技术栈

- **纯原生前端**：HTML5 + CSS3 + Vanilla JavaScript，无框架依赖。
- **Markdown 渲染**：`marked.js`
- **数学公式**：`KaTeX`（支持 `$...$` 行内公式和 `$$...$$` 块级公式）
- **图表渲染**：`Mermaid 10`支持思维导图和流程图
- **图片导出**：`dom-to-image-more`
- **本地代理**：`Python 3` + `http.server`（可选，用于网页转 Markdown）

### 核心设计

```
┌─────────────────────────────────────────────────────────────┐
│                    markdown-editor.html                      │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │  Editor      │  同步   │  Preview     │                  │
│  │  (textarea)  │ ──────▶ │  (marked.js) │                  │
│  └──────────────┘         └──────────────┘                  │
│         │                         │                         │
│         ▼                         ▼                         │
│   localStorage               KaTeX / Mermaid               │
│         │                         │                         │
│         ▼                         ▼                         │
│   自动保存 / 状态恢复        公式 / 图表渲染               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   web-to-md-proxy.py (可选)
                    网页抓取 + 反爬绕过
```
---

## 📁 项目结构

```
.
├── markdown-editor.html    # 主编辑器（单文件应用）
├── i18n.js                 # 多语言字典（10 种语言）
├── web-to-md-proxy.py      # 本地代理脚本（可选）
└── README.md               # 本文件
```

---

## 🚀 快速开始

### 方式一：直接打开（最简单）

```bash
# 克隆项目
git clone https://github.com/woyin2024/lengyi-markdown-editor.git

# 直接双击打开
markdown-editor.html
```

### 方式二：本地服务器（推荐）

```bash
cd markdown-editor

# Python 3
python -m http.server 8080

# 或 Node.js
npx serve .

# 打开浏览器访问
open http://localhost:8080/markdown-editor.html
```

### 方式三：使用本地代理（网页转 Markdown）

```bash
# 安装 requests（可选，推荐）
pip install requests

# 启动代理
python web-to-md-proxy.py

# 默认端口 8765
# 在编辑器中勾选「使用本地代理」即可
```

---

## 🤝 参与贡献

这个项目诞生于「自己用着顺手」的需求，但我相信它还能更好。

如果你有任何想法——新功能、Bug 修复、界面优化、语言补充、文档改进——都非常欢迎：

1. Fork 本仓库
2. 创建你的特性分支：`git checkout -b feature/AmazingFeature`
3. 提交更改：`git commit -m 'Add some AmazingFeature'`
4. 推送分支：`git push origin feature/AmazingFeature`
5. 提交 Pull Request

---

## 📜 开源协议

本项目基于 [MIT License](LICENSE) 开源。

你可以自由使用、修改、分发，如需商用请获取授权。只希望你在某个安静的午后，用它写出让自己满意的文章时，能想起这个项目的起点。

---
## 👤 关于作者

**冷逸**，中国 Top AI 技术媒体「沃垠AI」博主，不会写代码的 Vibe Coding 开发者，喜欢死磕 Prompt、Skills 和 Agent。

- **全平台统一账户**：沃垠AI
- **内容矩阵**：公众号、小红书、知乎、GitHub、B站、X 等


---
<div align="center">

### 如果它帮到了你，给个 ⭐ 吧。

**写得好，比什么都重要。**

</div>
