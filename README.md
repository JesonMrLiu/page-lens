# PageLens

> AI 驱动的浏览器侧边栏助手 —— 页面摘要、翻译、笔记与飞书导出，一站搞定。

PageLens 是一款 Chrome 扩展（Manifest V3），以**侧边栏面板**的形式运行，能够自动提取当前网页内容并注入 AI 对话上下文，帮助你快速理解、翻译和记录网页信息。

## 功能特性

- **AI 对话** — 基于当前页面内容与 AI 模型自由对话，提问、总结、解释皆可
- **一键快捷操作** — 页面摘要（含 Mermaid 流程图生成）、中英互译
- **流式响应** — 实时 SSE 流式输出，支持中途取消
- **智能内容提取** — 可读性启发式算法，自动定位页面正文（article → 语义标签 → 评分启发 → body），截断上限 15,000 字符
- **笔记系统** — 将 AI 回复保存为笔记，按来源分类浏览，支持 Markdown 渲染、复制、删除
- **飞书导出** — 笔记一键导出为飞书文档，支持标题、段落、列表、代码块、引用、分割线等格式
- **Markdown + Mermaid** — AI 回复以 GFM Markdown 渲染，`mermaid` / `flowchart` / `graph` 代码块自动绘制为 SVG 图表
- **多模型配置** — 支持任意 OpenAI 兼容 API（自定义 Base URL、API Key、模型 ID），可设置默认模型，内置连接测试
- **会话管理** — 对话历史持久化，支持新建和切换会话

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | React 18 + TypeScript |
| 构建 | Vite 5 + @crxjs/vite-plugin |
| 样式 | Tailwind CSS 3（支持暗色模式） |
| 状态管理 | Zustand 5 |
| 路由 | React Router DOM 6（HashRouter） |
| UI 组件 | Radix UI（Dialog、DropdownMenu、Select、Tabs、Toast、Tooltip） |
| 图标 | Lucide React |
| Markdown | react-markdown + remark-gfm |
| 图表 | Mermaid 11 |
| 数据存储 | chrome.storage.local |
| 扩展 API | Chrome Side Panel、Tabs、Scripting、Storage、Runtime Messaging |

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

启动 Vite 开发服务器（含 HMR），然后在 Chrome 中打开 `chrome://extensions`，启用开发者模式，点击「加载已解压的扩展程序」，选择 `dist` 目录即可。

### 生产构建

```bash
npm run build
```

先执行 TypeScript 类型检查，再进行 Vite 构建，产物输出到 `dist/` 目录。

## 项目结构

```
page-lens/
├── index.html                    # 侧边栏入口 HTML
├── manifest.config.ts            # Chrome 扩展 Manifest V3 配置
├── vite.config.ts                # Vite 构建配置
├── tailwind.config.ts            # Tailwind 主题配置
├── public/
│   └── icons/                    # 扩展图标（16/32/48/128px）
└── src/
    ├── shared/                   # 共享层：类型定义、常量、消息协议、工具函数
    │   ├── types.ts              #   核心数据接口
    │   ├── constants.ts          #   消息类型、默认值、提示词模板
    │   ├── messages.ts           #   Chrome Runtime 消息封装
    │   └── utils.ts              #   日期格式化、文本截断、语言检测
    ├── content/                  # 内容脚本：页面正文提取
    │   ├── index.ts              #   消息监听入口
    │   └── extractor.ts          #   可读性启发式提取算法
    ├── background/               # 后台 Service Worker
    │   ├── index.ts              #   Side Panel 行为设置 + 消息路由
    │   ├── message-router.ts     #   消息分发中心
    │   ├── ai-client.ts          #   OpenAI 兼容流式对话客户端
    │   ├── page-extractor.ts     #   内容提取编排（内容脚本 → 注入回退）
    │   └── feishu-client.ts      #   飞书 API 客户端（认证、文档创建、格式转换）
    ├── db/                       # 数据层：chrome.storage.local 封装
    │   ├── database.ts           #   存储引擎（初始化、保存、自增 ID）
    │   └── repositories/         #   各实体 Repository（模型配置、飞书配置、会话、笔记）
    ├── sidepanel/                # 侧边栏 UI
    │   ├── index.tsx             #   React 根组件
    │   ├── App.tsx               #   路由与布局
    │   ├── stores/               #   Zustand 状态管理
    │   ├── hooks/                #   自定义 Hooks（数据库、对话、笔记、模型、页面内容、飞书）
    │   ├── routes/               #   页面组件（ChatPage、NotesPage、SettingsPage）
    │   └── components/           #   UI 组件
    │       ├── shared/           #     通用组件（Header、Button、Toast、MarkdownRenderer、MermaidBlock）
    │       ├── chat/             #     对话组件（ChatInput、ChatMessage、QuickActions、ModelSelector）
    │       ├── notes/            #     笔记组件（NoteCard、NoteDetail）
    │       └── settings/         #     设置组件（ModelConfigList、ModelConfigForm、FeishuConfigForm）
    └── styles/
        └── globals.css           # Tailwind 层级、自定义组件类、动画
```

## 架构概览

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Side Panel    │◄───►│  Background Worker   │◄───►│  Content Script │
│   (React UI)    │     │  (消息路由/AI/飞书)    │     │  (页面内容提取)   │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
        │                        │
        │                  ┌─────┴─────┐
        │                  │           │
   chrome.storage      AI API    飞书 Open API
    (数据持久化)      (流式对话)   (文档导出)
```

- **Side Panel**：React 应用，负责所有用户交互，通过 Chrome Runtime Messaging 与后台通信
- **Background Worker**：Service Worker，承担消息路由、AI 流式请求、页面提取编排、飞书 API 调用
- **Content Script**：注入到网页中，使用启发式算法提取页面正文
- **数据持久化**：所有数据存储在 `chrome.storage.local`，以 JSON 格式管理

## 使用说明

1. 构建并加载扩展后，点击浏览器工具栏中的 PageLens 图标打开侧边栏
2. 在 **设置** 页面配置 AI 模型（填写 Base URL、API Key、模型名称）
3. 打开任意网页，侧边栏会自动提取页面内容
4. 通过输入框与 AI 对话，或使用快捷按钮进行摘要/翻译
5. 点击消息上的保存按钮将 AI 回复存为笔记
6. 在笔记页面可浏览、筛选、复制笔记，也可导出到飞书（需先配置飞书应用）

## License

MIT
