# PageLens

> AI 驱动的浏览器侧边栏助手 —— 页面摘要、翻译、笔记与飞书导出，一站搞定。

**当前版本：v1.1.0**

PageLens 是一款基于 Manifest V3 的**浏览器扩展**，兼容 **Chrome 与 Edge**，以**侧边栏面板**的形式运行，能够自动提取当前网页内容并注入 AI 对话上下文，帮助你快速理解、翻译和记录网页信息。

## 功能特性

- **AI 对话** — 基于当前页面内容与 AI 模型自由对话，提问、总结、解释皆可
- **思考推理** — 提供直接回答 / 一般思考 / 深度思考三种模式，支持 1-5 轮可配置深度思考，实时展示思考过程，支持中途取消
- **一键快捷操作** — 页面摘要（含 Mermaid 流程图生成）、中英互译
- **流式响应** — 实时 SSE 流式输出，支持中途取消
- **智能内容提取** — 可读性启发式算法，自动定位页面正文（article → 语义标签 → 评分启发 → body），截断上限 15,000 字符
- **笔记系统** — 将 AI 回复保存为笔记，按来源分类浏览，支持 Markdown 渲染、复制、删除
- **飞书导出** — 笔记一键导出为飞书文档，支持标题、段落（含行内格式）、有序/无序列表、引用、代码块、分割线、GFM 表格、Mermaid 图表（自动渲染为图片上传）等格式
- **Markdown + Mermaid** — AI 回复以 GFM Markdown 渲染，`mermaid` / `flowchart` / `graph` 代码块自动绘制为 SVG 图表
- **多模型配置** — 支持任意 OpenAI 兼容 API（自定义 Base URL、API Key、模型 ID），可设置默认模型，内置连接测试；预置 7 个主流提供商快捷配置（DeepseekAI、OpenAI、智谱 GLM、月之暗面 Kimi、通义千问、SiliconFlow、Ollama 本地）
- **会话管理** — 对话历史持久化，支持新建和切换会话
- **中英双语** — 界面支持中文 / 英文切换
- **明暗主题** — 浅色 / 深色 / 跟随系统三种主题模式

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

启动 Vite 开发服务器（含 HMR），然后在浏览器中加载扩展：

- **Chrome**：打开 `chrome://extensions` → 启用「开发者模式」→ 点击「加载已解压的扩展程序」→ 选择 `dist` 目录
- **Edge**：打开 `edge://extensions` → 启用「开发人员模式」→ 点击「加载解压缩的扩展」→ 选择 `dist` 目录

### 生产构建

```bash
npm run build
```

先执行 TypeScript 类型检查，再进行 Vite 构建，产物输出到 `dist/` 目录。

## 浏览器支持

PageLens 基于 Manifest V3 开发，**Chrome 与 Microsoft Edge 均可直接加载使用**，两者加载步骤一致（详见上方「快速开始」）。

| 浏览器 | 最低版本要求 | 原因 |
|--------|--------------|------|
| Google Chrome | 114+ | 依赖 `chrome.sidePanel` 侧边栏 API |
| Microsoft Edge | 114+ | 同上（Edge 基于 Chromium 内核，完全兼容） |

> 暂不支持 Firefox：Firefox 使用不同的扩展 API 命名空间（`browser.*`），需要额外适配。

## 项目结构

```
page-lens/
├── index.html                    # 侧边栏入口 HTML
├── manifest.config.ts            # Manifest V3 配置（Chrome / Edge 通用）
├── vite.config.ts                # Vite 构建配置
├── tailwind.config.ts            # Tailwind 主题配置
├── public/
│   └── icons/                    # 扩展图标（16/32/48/128px）
└── src/
    ├── shared/                   # 共享层：类型定义、常量、消息协议、工具函数
    │   ├── types.ts              #   核心数据接口
    │   ├── constants.ts          #   消息类型、默认值、提示词模板
    │   ├── messages.ts           #   Chrome Runtime 消息封装
    │   ├── preset-models.ts      #   预置 AI 提供商配置
    │   └── utils.ts              #   日期格式化、文本截断、语言检测
    ├── content/                  # 内容脚本：页面正文提取
    │   ├── index.ts              #   消息监听入口
    │   └── extractor.ts          #   可读性启发式提取算法
    ├── background/               # 后台 Service Worker
    │   ├── index.ts              #   Side Panel 行为设置 + 消息路由
    │   ├── message-router.ts     #   消息分发中心
    │   ├── ai-client.ts          #   OpenAI 兼容流式对话客户端（含思考推理）
    │   ├── page-extractor.ts     #   内容提取编排（内容脚本 → 注入回退）
    │   └── feishu-client.ts      #   飞书 API 客户端（认证、文档创建、格式转换）
    ├── db/                       # 数据层：chrome.storage.local 封装
    │   ├── database.ts           #   存储引擎（初始化、保存、自增 ID）
    │   └── repositories/         #   各实体 Repository（模型配置、飞书配置、会话、笔记）
    ├── sidepanel/                # 侧边栏 UI
    │   ├── index.tsx             #   React 根组件
    │   ├── App.tsx               #   路由与布局
    │   ├── stores/               #   Zustand 状态管理（对话、全局设置）
    │   ├── hooks/                #   自定义 Hooks（数据库、对话、笔记、模型、页面内容、飞书）
    │   ├── contexts/             #   React Context（多语言上下文）
    │   ├── i18n/                 #   国际化（中文 zh、英文 en）
    │   ├── utils/                #   UI 工具（Mermaid 图表渲染）
    │   ├── routes/               #   页面组件（ChatPage、NotesPage、SettingsPage）
    │   └── components/           #   UI 组件
    │       ├── shared/           #     通用组件（Header、Button、Toast、MarkdownRenderer、CodeBlock）
    │       ├── chat/             #     对话组件（ChatInput、ChatMessage、QuickActions、ModelSelector、ThinkModeSelector、ThinkingProcessPanel）
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
2. 在 **设置** 页面完成初始配置（设置页分为三个 Tab）：
   - **AI 模型**：填写 Base URL、API Key、模型名称，可选用预置提供商；可设默认模型并测试连接
   - **飞书**：配置飞书应用以启用笔记导出（详见下方「飞书导出配置」）
   - **通用**：切换界面语言（中/英）、主题（浅色/深色/跟随系统）、思考推理轮数
3. 打开任意网页，侧边栏会自动提取页面内容
4. 通过输入框与 AI 对话，或使用快捷按钮进行摘要/翻译；可切换思考模式获得更深入的回答
5. 点击消息上的保存按钮将 AI 回复存为笔记
6. 在笔记页面可浏览、筛选、复制笔记，也可导出到飞书（需先在「设置 → 飞书」完成配置）

## 飞书导出配置

将笔记导出为飞书文档前，需先在飞书开放平台创建应用并授权，然后在 PageLens 中填写应用凭证。

### 1. 创建飞书企业自建应用

1. 登录 [飞书开放平台](https://open.feishu.cn/app)
2. 「开发者后台」→「创建企业自建应用」，填写应用名称与描述
3. 进入应用「凭证与基础信息」页面，获取以下两项凭证：
   - **App ID**：形如 `cli_xxxxxxxxxxxx`
   - **App Secret**：应用密钥

### 2. 开通应用权限

进入应用「权限管理」，开通以下权限。

> ⚠️ **重要**：修改权限后，必须前往「版本管理与发布」创建新版本并发布上线，权限才会生效。

| 权限 scope | 用途 | 必需场景 |
|------------|------|----------|
| `drive:drive` | 查看、评论、编辑和管理云空间中所有文件 | 让「测试连接」验证通过 |
| `drive:drive.metadata:readonly` | 查看云空间中文件元数据 | 让「测试连接」验证通过 |
| `docx:document` | 查看、评论、编辑、管理云文档 | 创建文档、写入内容、上传 Mermaid 图片 |

> 完整使用需开通 `drive:drive`、`drive:drive.metadata:readonly`、`docx:document` 三个权限。前两者保证「测试连接」按钮验证通过，第三个保证内容能写入云文档。

### 3. 发布应用版本

「版本管理与发布」→「创建版本」→ 填写版本号与更新说明 →「申请发布上线」→ 等待管理员审核通过。

### 4.（可选）配置目标文件夹

若希望导出的文档保存到**指定文件夹**（而非应用默认位置），需额外完成：

1. 在飞书云空间打开目标文件夹，从浏览器地址栏复制 **文件夹 Token**（形如 `nodbcb...` 的字符串）
2. 在该文件夹右上角点击「共享」→ 搜索并添加应用对应的**机器人**为协作者 → 授予「可编辑」权限

> 不填文件夹 Token 则跳过此步，文档会创建到应用默认位置。

### 5. 在 PageLens 中填写配置

1. 点击浏览器工具栏 PageLens 图标 → 打开侧边栏 → 顶部「设置」
2. 切换到「飞书」Tab
3. 依次填入：**App ID**、**App Secret**、（可选）**文件夹 Token**
4. 点击「测试连接」验证（同时校验认证与文件夹权限）
5. 点击「保存」

配置完成后，在笔记详情页点击「导出到飞书」即可生成飞书文档，并可在笔记中查看 / 打开对应的飞书文档链接。

### 常见问题

- **仅支持国内版飞书**（`open.feishu.cn`），暂不支持国际版 Lark（`open.larksuite.com`）。
- **认证失败**：检查 App ID / App Secret 是否正确，以及网络能否访问 `open.feishu.cn`。
- **错误码 91203（文件夹 Token 无效）**：从飞书目标文件夹地址栏复制正确的 Token，确认未包含多余字符或 URL 前缀。
- **错误码 91204（权限 scope 未生效）**：前往「权限管理」开通 `drive:drive` 与 `drive:drive.metadata:readonly`，并**发布新版本**。
- **错误码 91204（应用未授权访问文件夹）**：云空间权限已开通，但应用未被添加为该文件夹的协作者。请在目标文件夹「共享」中把应用机器人添加为协作者。
- **tenant_access_token** 由应用凭证自动获取并缓存（过期前自动刷新），无需手动配置或填写。

## License

MIT
