const zh: Record<string, string> = {
  // === Header ===
  'header.chat': '聊天',
  'header.notes': '笔记',
  'header.settings': '设置',

  // === App ===
  'app.initDatabase': '正在初始化数据库...',
  'app.databaseInitFailed': '数据库初始化失败',
  'app.retry': '重试',

  // === ChatPage ===
  'chat.newChat': '新对话',
  'chat.emptyTitle': '开始对话',
  'chat.emptyDescWithModels': '输入消息开始与 AI 对话，或使用下方快捷操作',
  'chat.emptyDescNoModels': '请先在设置中配置 AI 模型',
  'chat.sendFailed': '发送失败',

  // === ChatInput ===
  'chatInput.placeholder': '输入消息... (Enter 发送, Shift+Enter 换行)',
  'chatInput.stopGenerating': '停止生成',
  'chatInput.send': '发送',

  // === ChatMessage ===
  'chatMessage.alreadySaved': '该消息已保存为笔记',
  'chatMessage.savedAsNote': '已保存为笔记',
  'chatMessage.saveFailed': '保存失败',
  'chatMessage.copy': '复制',
  'chatMessage.copied': '已复制',
  'chatMessage.saved': '已保存',
  'chatMessage.saveAsNote': '保存为笔记',

  // === ThinkingProcessPanel ===
  'thinking.inProgress': '思考中 (第{round}轮)...',
  'thinking.complete': '思考过程 ({count}轮)',
  'thinking.roundLabel': '第{round}轮思考',
  'thinking.currentlyThinking': '正在思考...',

  // === QuickActions ===
  'quickActions.actionFailed': '操作失败',
  'quickActions.summarize': '总结',
  'quickActions.translateToZh': '英→中',
  'quickActions.translateToEn': '中→英',
  'quickActions.prefix': '快捷:',

  // === ModelSelector ===
  'modelSelector.noModel': '未配置模型',

  // === ThinkModeSelector ===
  'thinkMode.none': '直接回答',
  'thinkMode.normal': '一般思考',
  'thinkMode.deep': '深度思考',

  // === ModelConfigList ===
  'modelConfig.title': 'AI 模型 ({count})',
  'modelConfig.add': '添加',
  'modelConfig.addNewModel': '添加新模型',
  'modelConfig.noModels': '暂无配置的 AI 模型',
  'modelConfig.default': '默认',
  'modelConfig.addedAt': '添加于 {date}',
  'modelConfig.setDefault': '设为默认',
  'modelConfig.edit': '编辑',
  'modelConfig.confirmDelete': '确认删除',
  'modelConfig.cancel': '取消',
  'modelConfig.delete': '删除',

  // === ModelConfigForm ===
  'modelForm.connectionSuccess': '连接成功！',
  'modelForm.connectionFailed': '连接失败',
  'modelForm.providerLabel': '服务提供商',
  'modelForm.customProvider': '自定义',
  'modelForm.nameLabel': '名称',
  'modelForm.namePlaceholder': '例如：DeepseekAI',
  'modelForm.baseUrlLabel': 'API 地址',
  'modelForm.baseUrlHint': '支持 OpenAI 兼容的 API 地址',
  'modelForm.apiKeyLabel': 'API Key',
  'modelForm.apiKeyLocalHint': '(本地服务可不填)',
  'modelForm.apiKeyPlaceholderLocal': '本地服务无需 API Key',
  'modelForm.modelIdLabel': '模型 ID',
  'modelForm.customModel': '自定义模型...',
  'modelForm.modelIdPlaceholder': '输入模型 ID',
  'modelForm.backToPresets': '← 返回预置模型列表',
  'modelForm.maxTokensLabel': '最大 Tokens',
  'modelForm.temperatureLabel': '温度 ({value})',
  'modelForm.update': '更新',
  'modelForm.add': '添加',
  'modelForm.testConnection': '测试连接',
  'modelForm.cancel': '取消',
  'modelForm.setDefault': '设为默认',
  'modelForm.delete': '删除',

  // === FeishuConfigForm ===
  'feishu.connectionSuccessWithFolder': '连接成功！应用凭证和文件夹权限验证通过。',
  'feishu.connectionSuccessNoFolder': '连接成功！飞书应用认证通过。',
  'feishu.connectionFailed': '连接失败',
  'feishu.saveSuccess': '保存成功！',
  'feishu.saveFailed': '保存失败',
  'feishu.title': '飞书应用配置',
  'feishu.configured': '已配置',
  'feishu.appIdLabel': 'App ID',
  'feishu.appSecretLabel': 'App Secret',
  'feishu.appSecretPlaceholder': '请输入飞书 App Secret',
  'feishu.folderTokenLabel': '文件夹 Token（可选）',
  'feishu.folderTokenPlaceholder': '目标文件夹的 token',
  'feishu.folderTokenHint': '导出的文档将保存到此文件夹。需要同时满足：应用已开通 drive:drive 和 docx:document 权限，且应用已被添加为该文件夹的协作者。',
  'feishu.folderTokenTip': '提示：如果测试连接失败，可先清空文件夹 Token 单独测试认证是否通过。',
  'feishu.save': '保存',
  'feishu.testConnection': '测试连接',
  'feishu.goToOpenPlatform': '前往飞书开放平台创建应用',

  // === NotesPage ===
  'notes.filterAll': '全部',
  'notes.filterSummary': '总结',
  'notes.filterTranslation': '翻译',
  'notes.filterChat': '对话',
  'notes.deleted': '笔记已删除',
  'notes.exportedToFeishu': '已导出到飞书',
  'notes.exportFailed': '导出失败',
  'notes.emptyTitle': '暂无笔记',
  'notes.emptyDesc': '在聊天中保存 AI 回复，或总结页面内容后可保存为笔记',

  // === NoteCard ===
  'noteCard.sourceChat': '对话',
  'noteCard.sourceSummary': '总结',
  'noteCard.sourceTranslation': '翻译',
  'noteCard.sourceManual': '手动',
  'noteCard.exportToFeishu': '导出到飞书',
  'noteCard.confirmDelete': '确认删除',
  'noteCard.delete': '删除',

  // === NoteDetail ===
  'noteDetail.sourceChat': '对话',
  'noteDetail.sourceSummary': '总结',
  'noteDetail.sourceTranslation': '翻译',
  'noteDetail.sourceManual': '手动',
  'noteDetail.source': '来源',
  'noteDetail.sourceLabel': '来源：',
  'noteDetail.copied': '已复制',
  'noteDetail.copy': '复制',
  'noteDetail.openFeishuDoc': '打开飞书文档',
  'noteDetail.exportToFeishu': '导出到飞书',
  'noteDetail.delete': '删除',

  // === CodeBlock ===
  'codeBlock.copyCode': '复制代码',
  'codeBlock.copied': '已复制',
  'codeBlock.copy': '复制',

  // === SettingsPage ===
  'settings.tabAiModels': 'AI 模型',
  'settings.tabFeishu': '飞书',
  'settings.tabGeneral': '通用',
  'settings.generalTitle': '通用设置',
  'settings.language': '界面语言',
  'settings.languageZh': '中文',
  'settings.languageEn': 'English',
  'settings.theme': '主题',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.themeSystem': '跟随系统',
  'settings.thinkConfigTitle': '思考推理配置',
  'settings.thinkConfigDesc': '配置不同思考模式的推理轮数。更多轮数可以提供更深入的分析，但会消耗更多时间和 Token。',
  'settings.normalThinkRounds': '一般思考轮数',
  'settings.deepThinkRounds': '深度思考轮数',
  'settings.roundsFast': '1轮（快速）',
  'settings.roundsDeep': '{max}轮（深入）',
  'settings.roundsUnit': '{count} 轮',
  'settings.save': '保存设置',
  'settings.saved': '已保存',

  // === formatDate ===
  'date.justNow': '刚刚',
  'date.minutesAgo': '{count} 分钟前',
  'date.hoursAgo': '{count} 小时前',
  'date.daysAgo': '{count} 天前',
};

export default zh;
