# Kanban 当前实现状态与差异修正文档

> 本文是 Kanban 开发文档体系中的状态修正文档。
>
> 它不替代 `apps/desktop/docs/kanban.md` 的总纲，也不替代 `kanban/gui-remediation-plan.md` 和 `kanban/conversation-task-integration.md` 的实施方案。
>
> 本文用于记录当前代码已经落地到什么程度、哪些旧文档描述已经过期、后续不要重复开发什么，以及新发现的 Desktop GUI 问题。

## 1. 文档层级关系

当前 Kanban 文档层级：

```text
apps/desktop/docs/
  kanban.md
  kanban/
    gui-remediation-plan.md
    conversation-task-integration.md
    implementation-status.md
```

职责划分：

| 文档 | 职责 |
| --- | --- |
| `kanban.md` | Kanban 总体目标、数据模型、IPC、长期路线 |
| `kanban/gui-remediation-plan.md` | Kanban 页面布局、详情面板、拖拽、排序等 GUI 修复计划 |
| `kanban/conversation-task-integration.md` | Chat / Agent / Profile / Cron 与 Kanban task 的集成计划 |
| `kanban/implementation-status.md` | 当前代码完成情况、文档差异修正、新增问题清单 |

阅读顺序建议：

```text
kanban.md
  -> implementation-status.md
  -> gui-remediation-plan.md
  -> conversation-task-integration.md
```

原因：`implementation-status.md` 会指出哪些总纲内容已经被当前代码超前实现或替代。

## 2. 当前结论

截至本文更新时，Kanban 已经不再只是文档或原型。

当前代码已完成：

- Desktop `/kanban` 路由接入。
- Kanban 页面基础 UI。
- Board / Task / Comment 基础 CRUD。
- SQLite 存储。
- `reorderTasks` 排序持久化。
- Column 固定宽度。
- 右侧详情面板。
- Task card 点击打开详情。
- 空列 droppable。
- 从 assistant 消息手动创建 Kanban task 的 MVP。
- Task 元数据字段扩展：`source`、`sessionId`、`profileId`、`assigneeType`、`assigneeLabel`、`syncMode` 等。

当前仍未完成：

- Agent plan / todo 自动进入 Kanban。
- running / blocked / review / done 状态自动同步。
- Cron failure 自动创建 blocked task。
- Chat task 创建时精确保存 `messageId`。
- 从 user message 或 selected text 创建 task。
- 创建 Chat task 时选择目标 board。
- Kanban sidebar / desktop navigation 显示名称。

## 3. 与旧文档的差异修正

### 3.1 存储层已经从 JSON 变成 SQLite

`kanban.md` 早期写的是：

```text
HERMES_HOME/kanban.json
```

当前代码实际已经使用：

```text
HERMES_HOME/kanban.db
```

并且 main process 使用 SQLite 作为 Kanban 存储层。

当前实现语义：

```text
Renderer
  -> window.hermesDesktop.kanban.*
    -> preload IPC
      -> main process
        -> SQLite kanban.db
```

因此，后续开发不要再实现 JSON 写入逻辑，也不要再新增 `kanban.json`。

需要后续更新 `kanban.md` 的章节：

```text
6. 本地持久化设计
```

应从 JSON 方案改成 SQLite 方案。

### 3.2 `reorderTasks` 已经落地

旧文档中 `reorderTasks` 被描述为建议新增。

当前实现已经包含：

```ts
window.hermesDesktop.kanban.reorderTasks(boardId, updates)
```

后续不要重复新增第二套排序 API。

如果继续优化排序，只应围绕现有 `reorderTasks` 做：

- 修复排序边界。
- 增加测试。
- 优化 optimistic update。
- 确保和 SQLite `sort_order` 一致。

### 3.3 GUI 第一轮修复已部分完成

`gui-remediation-plan.md` 中列出的核心 GUI 问题已有明显落地：

| GUI 项 | 当前状态 | 说明 |
| --- | --- | --- |
| Column 固定宽度 | 已完成 | Column 使用固定宽度，避免 6 列被压缩 |
| 横向滚动 | 已完成 | Board pane 使用横向滚动容器 |
| 详情面板改为右侧 pane | 已完成 | 不再使用 absolute overlay 覆盖 Board |
| Task card 点击打开详情 | 已完成 | Card 支持 `onSelect` |
| Droppable column | 已完成 | Column 注册 droppable id |
| 空列 drop | 已完成基础版 | 空列可作为拖拽目标 |
| 排序持久化 | 已完成基础版 | 已使用 `order` / `sort_order` 和 `reorderTasks` |

仍需继续跟进：

- 侧边栏 / Desktop nav 中 Kanban 只有图标没有名称。
- source / assignee metadata 的显示还不统一。
- 部分 Kanban 文案仍可能未完全 i18n。
- Chat 创建 task 后没有明确入口跳转到 Kanban。

### 3.4 Conversation task integration 已完成 MVP，但未完成自动同步

`conversation-task-integration.md` 的最小目标里，“从 Chat message 手动创建 Kanban task”已有 MVP。

当前已完成：

```text
assistant message action menu
  -> Create Kanban Task
  -> window.hermesDesktop.kanban.createTask(...)
  -> source = chat
  -> sessionId = active session
  -> profileId = active gateway profile
  -> assigneeType = user
  -> assigneeLabel = You
  -> syncMode = manual
```

未完成：

- 创建时未保存 `messageId`。
- 只对 assistant message 提供入口，未覆盖 user message。
- 未提供 selected text -> task。
- 默认写入 `default` board，未让用户选择 board。
- 未做去重。
- 未做 linked / mirrored sync。
- 未接入 agent plan / todo。

## 4. 当前完成情况总表

| 模块 | 状态 | 后续动作 |
| --- | --- | --- |
| `/kanban` 路由 | 已完成 | 不要重复 |
| Kanban 页面 | 已完成基础版 | 继续增量优化 |
| Board CRUD | 已完成基础版 | 不要重复 |
| Task CRUD | 已完成基础版 | 不要重复 |
| Comment CRUD | 已完成基础版 | 不要重复 |
| SQLite 存储 | 已完成 | 更新旧文档，不要回退 JSON |
| `reorderTasks` | 已完成基础版 | 只做测试和边界优化 |
| GUI 列宽 / 横向滚动 | 已完成 | 验证窄屏体验 |
| 右侧详情面板 | 已完成 | 优化 metadata 展示 |
| 空列拖拽 | 已完成基础版 | 增加测试 |
| Chat message -> Kanban | 已完成 MVP | 补 `messageId`、board 选择、跳转 |
| User message -> Kanban | 未完成 | 后续增量实现 |
| selected text -> Kanban | 未完成 | 后续增量实现 |
| Agent plan -> Kanban | 未完成 | 不要先做自动同步，先做手动批量导入 |
| Agent 状态同步 | 未完成 | 等 linked 模型稳定后做 |
| Cron failure -> Kanban | 未完成 | 后置 |
| Sidebar Kanban 名称显示 | 未完成 | 当前新增待办 |

## 5. 新增问题：Desktop 界面 Kanban 只有图标，没有名称

### 5.1 问题描述

当前 Desktop 左侧导航 / sidebar 中，Kanban 入口只显示图标，没有显示名称。

从用户视角看：

```text
只有 checklist / 看板图标
没有 “Kanban” 或 “看板” 文本
```

这会导致：

- 新用户不知道该图标代表 Kanban。
- Kanban 功能入口不明显。
- 和其他有明确名称或可识别入口的功能相比，可发现性较差。

### 5.2 代码定位

该问题不在 `KanbanView` 页面内部。

它属于 Desktop navigation / sidebar 层级。

当前应优先检查：

```text
apps/desktop/src/app/chat/sidebar/index.tsx
```

其中 `SIDEBAR_NAV` 里 Kanban nav item 当前类似：

```tsx
{ id: 'kanban', label: '', icon: props => <Codicon name="checklist" {...props} />, route: KANBAN_ROUTE }
```

问题点：

```text
label: ''
```

这意味着即使 sidebar 组件支持 label，也没有可显示文本。

### 5.3 不要重复开发

不要为了解决这个问题新建第二个 Kanban 入口。

不要新增：

```text
KanbanButton
KanbanSidebar
KanbanPanelLauncher
```

应直接修现有 nav item：

```text
SIDEBAR_NAV
```

并复用现有 sidebar 渲染逻辑。

### 5.4 推荐修复方案

第一步，给 Kanban nav item 设置非空 label：

```tsx
{ id: 'kanban', label: 'Kanban', icon: props => <Codicon name="checklist" {...props} />, route: KANBAN_ROUTE }
```

第二步，接入 i18n：

```tsx
label: t.desktop.kanban.navLabel
```

如果 `SIDEBAR_NAV` 是模块级常量，不能直接调用 hook，则可改为以下任一方案：

方案 A：把 label 改成稳定 key：

```ts
labelKey: 'desktop.kanban.navLabel'
```

渲染时通过 i18n 解析。

方案 B：把 `SIDEBAR_NAV` 改成工厂函数：

```ts
function sidebarNav(t: Translations): SidebarNavItem[] {
  return [
    ...,
    { id: 'kanban', label: t.desktop.kanban.navLabel, icon: props => <Codicon name="checklist" {...props} />, route: KANBAN_ROUTE }
  ]
}
```

方案 C：如果 sidebar 设计上 rail 始终只显示图标，则至少确保 tooltip / aria-label 使用非空 label：

```tsx
aria-label="Kanban"
title="Kanban"
tooltip="Kanban"
```

### 5.5 推荐显示规范

英文：

```text
Kanban
```

中文：

```text
看板
```

如果 sidebar 展开状态有文字，应显示：

```text
Kanban / 看板
```

如果 sidebar 收起状态只显示图标，应至少有 tooltip：

```text
hover icon -> Kanban / 看板
```

### 5.6 验收标准

- Desktop sidebar 中 Kanban 入口不再只有图标。
- 展开状态下能看到 `Kanban` 或 `看板`。
- 收起状态下 hover 图标能看到 tooltip。
- icon 仍然使用现有 checklist 图标，不新增第二个入口。
- 点击入口仍然进入 `#/kanban`。
- i18n 下英文显示 `Kanban`，中文显示 `看板`。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

## 6. 后续推荐优先级

### P0：修正文档和导航可发现性

1. 更新 `kanban.md` 的持久化章节，从 JSON 改成 SQLite。
2. 修复 sidebar Kanban 只有图标没有名称的问题。
3. 确认 sidebar label / tooltip / aria-label 都有正确文案。

### P1：补齐 Chat -> Kanban MVP 的关键缺口

1. Chat 创建 task 时写入 `messageId`。
2. 创建成功后提供 “Open in Kanban”。
3. 创建时不要永远写入 `default` board，至少支持选择或最近 board。
4. 添加基本去重，避免同一 message 连续创建重复 task。

### P2：统一 assignee 语义

1. Card 和 detail panel 都使用统一显示函数：

```ts
const displayAssignee = task.assigneeLabel || task.assignee || t.desktop.kanban.unassigned
```

2. 手动创建 task 时逐步从自由文本 `assignee` 迁移到：

```ts
assigneeType
assigneeId
assigneeLabel
```

3. 明确 profile 只作为上下文，不作为 assignee。

### P3：Agent / Cron 集成

1. 先做 Agent plan 手动批量导入。
2. 再做 linked sync。
3. 最后做 mirrored sync。
4. Cron failure -> blocked task 后置。

## 7. 不要重复开发清单

后续开发请继续遵守：

- 不要新建第二个 Kanban 页面。
- 不要新建第二套 task 存储。
- 不要再实现 `kanban.json` 写入路径。
- 不要新建第二套 CRUD API。
- 不要新建第二套排序 API。
- 不要把 profile 当成负责人。
- 不要把 sidebar Kanban 名称问题放到 `KanbanView` 内修；它属于 sidebar nav 层。

## 8. 当前最小下一步

最小下一步建议只做两个补丁：

```text
Patch 1: docs
  - 更新 kanban.md 的存储章节为 SQLite
  - 保留 implementation-status.md 作为状态修正索引

Patch 2: sidebar nav
  - 给 SIDEBAR_NAV 的 kanban item 增加 label / tooltip / aria-label
  - 增加 i18n 文案：en=Kanban, zh=看板
```

完成这两个补丁后，文档和 Desktop 入口可发现性会先对齐，后续再继续推进 Chat / Agent / Cron 集成。