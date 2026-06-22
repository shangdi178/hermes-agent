import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

import { PAGE_INSET_X } from '../layout-constants'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KanbanBoard {
  id: string
  title: string
  description: string
  createdAt: number
}

interface KanbanTask {
  id: string
  boardId: string
  title: string
  description: string
  status: string
  priority: string
  assignee: string
  createdBy: string
  createdAt: number
  updatedAt: number
  archived: boolean
}

interface KanbanComment {
  id: string
  taskId: string
  author: string
  body: string
  createdAt: number
}

type KanbanStatus = 'todo' | 'ready' | 'running' | 'review' | 'done' | 'blocked'

interface KanbanStatusColumn {
  id: KanbanStatus
  label: string
  color: string
  icon: string
}

const STATUS_COLUMNS: KanbanStatusColumn[] = [
  { id: 'todo', label: 'Todo', color: 'bg-sky-500', icon: 'circle-outline' },
  { id: 'ready', label: 'Ready', color: 'bg-blue-500', icon: 'circle-filled' },
  { id: 'running', label: 'Running', color: 'bg-amber-500', icon: 'debug-start' },
  { id: 'review', label: 'Review', color: 'bg-purple-500', icon: 'eye' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500', icon: 'check' },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-500', icon: 'error' }
]

const PRIORITY_CONFIG = {
  high: { label: 'High', color: 'text-red-500', icon: 'arrow-up' },
  medium: { label: 'Medium', color: 'text-amber-500', icon: 'dash' },
  low: { label: 'Low', color: 'text-sky-500', icon: 'arrow-down' }
} as const

// ---------------------------------------------------------------------------
// Sortable task card
// ---------------------------------------------------------------------------

function SortableTaskCard({
  task,
  onEdit,
  onDelete
}: {
  task: KanbanTask
  onEdit: (task: KanbanTask) => void
  onDelete: (task: KanbanTask) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group cursor-default rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-3 text-xs shadow-sm transition-shadow duration-100 hover:border-(--ui-stroke-tertiary)',
        isDragging && 'z-50 shadow-lg opacity-90'
      )}
      {...attributes}
      {...listeners}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="flex-1 text-sm font-medium leading-snug text-(--ui-text-primary)">
          {task.title}
        </span>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
            onClick={e => {
              e.stopPropagation()
              onEdit(task)
            }}
            title="Edit task"
          >
            <Codicon name="edit" size="0.75rem" />
          </button>
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-red-500"
            onClick={e => {
              e.stopPropagation()
              onDelete(task)
            }}
            title="Delete task"
          >
            <Codicon name="trash" size="0.75rem" />
          </button>
        </div>
      </div>
      {task.description && (
        <p className="mb-2 line-clamp-2 leading-relaxed text-(--ui-text-tertiary)">
          {task.description}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Codicon name={priority.icon} size="0.75rem" className={priority.color} />
        <Badge variant="outline" className="text-[0.6rem] uppercase tracking-wider">
          {priority.label}
        </Badge>
        {task.assignee && (
          <span className="ml-auto flex items-center gap-1 text-[0.6rem] text-(--ui-text-tertiary)">
            <Codicon name="person" size="0.625rem" />
            {task.assignee}
          </span>
        )}
        {task.status === 'blocked' && (
          <Codicon name="error" size="0.75rem" className="text-red-500" />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Kanban column
// ---------------------------------------------------------------------------

function KanbanColumn({
  column,
  tasks,
  onEditTask,
  onDeleteTask
}: {
  column: KanbanStatusColumn
  tasks: KanbanTask[]
  onEditTask: (task: KanbanTask) => void
  onDeleteTask: (task: KanbanTask) => void
}) {
  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks])

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Column header */}
      <div className="mb-3 flex shrink-0 items-center gap-2 px-1">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', column.color)} />
        <span className="text-xs font-semibold uppercase tracking-wider text-(--ui-text-secondary)">
          {column.label}
        </span>
        <span className="ml-auto text-[0.65rem] text-(--ui-text-tertiary)">
          {tasks.length}
        </span>
      </div>

      {/* Task list */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-dashed border-transparent p-1 transition-colors">
          {tasks.map(task => (
            <SortableTaskCard key={task.id} task={task} onEdit={onEditTask} onDelete={onDeleteTask} />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <span className="text-[0.6875rem] text-(--ui-text-tertiary/50)">Drop tasks here</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create / Edit task dialog
// ---------------------------------------------------------------------------

function TaskDialog({
  open,
  onOpenChange,
  task,
  onSave
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: KanbanTask | null
  onSave: (data: Partial<KanbanTask> & { title: string }) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assignee, setAssignee] = useState('')
  const [status, setStatus] = useState<string>('todo')

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? '')
      setDescription(task?.description ?? '')
      setPriority(task?.priority ?? 'medium')
      setAssignee(task?.assignee ?? '')
      setStatus(task?.status ?? 'todo')
    }
  }, [open, task])

  const handleSave = useCallback(() => {
    if (!title.trim()) return
    onSave({ title: title.trim(), description, priority, assignee, status })
    onOpenChange(false)
  }, [title, description, priority, assignee, status, onSave, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update the task details below.' : 'Create a new kanban task.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-(--ui-text-secondary)">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-(--ui-text-secondary)">Description</label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description…"
              rows={3}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-(--ui-text-secondary)">Status</label>
              <select
                className={cn(
                  'h-8 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 text-xs text-(--ui-text-primary) outline-none',
                  'focus:border-(--ui-stroke-tertiary) focus:ring-[0.125rem] focus:ring-ring/30'
                )}
                value={status}
                onChange={e => setStatus(e.target.value)}
              >
                {STATUS_COLUMNS.map(col => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs font-medium text-(--ui-text-secondary)">Priority</label>
              <select
                className={cn(
                  'h-8 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 text-xs text-(--ui-text-primary) outline-none',
                  'focus:border-(--ui-stroke-tertiary) focus:ring-[0.125rem] focus:ring-ring/30'
                )}
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-(--ui-text-secondary)">Assignee</label>
            <Input
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              placeholder="Unassigned"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSave} disabled={!title.trim()}>
            {task ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Task detail / comments panel
// ---------------------------------------------------------------------------

function TaskDetailPanel({
  task,
  comments,
  onClose,
  onAddComment,
  onDeleteComment,
  onArchive,
  onStatusChange
}: {
  task: KanbanTask
  comments: KanbanComment[]
  onClose: () => void
  onAddComment: (body: string) => void
  onDeleteComment: (id: string) => void
  onArchive: () => void
  onStatusChange: (status: string) => void
}) {
  const [commentText, setCommentText] = useState('')

  const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.medium
  const statusCol = STATUS_COLUMNS.find(c => c.id === task.status) ?? STATUS_COLUMNS[0]

  const handleSubmitComment = useCallback(() => {
    if (!commentText.trim()) return
    onAddComment(commentText.trim())
    setCommentText('')
  }, [commentText, onAddComment])

  return (
    <div className="flex h-full flex-col border-l border-(--ui-stroke-secondary) bg-(--ui-bg-primary)">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-(--ui-stroke-secondary) px-4 py-3">
        <span className="text-xs font-semibold text-(--ui-text-secondary)">Task Details</span>
        <button
          className="flex h-6 w-6 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
          onClick={onClose}
        >
          <Codicon name="close" size="0.875rem" />
        </button>
      </div>

      {/* Task info */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <h3 className="mb-2 text-sm font-semibold leading-snug text-(--ui-text-primary)">
          {task.title}
        </h3>
        {task.description && (
          <p className="mb-4 whitespace-pre-wrap text-xs leading-relaxed text-(--ui-text-tertiary)">
            {task.description}
          </p>
        )}

        {/* Meta badges */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="outline" className="flex items-center gap-1">
            <span className={cn('h-1.5 w-1.5 rounded-full', statusCol.color)} />
            {statusCol.label}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Codicon name={priority.icon} size="0.75rem" className={priority.color} />
            {priority.label}
          </Badge>
          {task.assignee && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Codicon name="person" size="0.75rem" />
              {task.assignee}
            </Badge>
          )}
        </div>

        {/* Status quick-change */}
        <div className="mb-4">
          <label className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wider text-(--ui-text-tertiary)">
            Move to
          </label>
          <div className="flex flex-wrap gap-1">
            {STATUS_COLUMNS.map(col => (
              <button
                key={col.id}
                className={cn(
                  'rounded px-2 py-1 text-[0.65rem] font-medium transition-colors',
                  task.status === col.id
                    ? 'bg-(--ui-control-active-background) text-(--ui-text-primary)'
                    : 'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)'
                )}
                onClick={() => onStatusChange(col.id)}
              >
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Archive button */}
        <Button variant="outline" size="sm" className="mb-4 w-full" onClick={onArchive}>
          <Codicon name="archive" size="0.75rem" />
          Archive Task
        </Button>

        {/* Comments section */}
        <div className="border-t border-(--ui-stroke-secondary) pt-3">
          <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)">
            Comments ({comments.length})
          </h4>
          <div className="mb-3 flex flex-col gap-2">
            {comments.map(comment => (
              <div
                key={comment.id}
                className="group rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) p-2"
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-[0.6rem] font-medium text-(--ui-text-secondary)">
                    {comment.author || 'Anonymous'}
                  </span>
                  <button
                    className="flex h-4 w-4 items-center justify-center rounded text-(--ui-text-tertiary) opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                    onClick={() => onDeleteComment(comment.id)}
                    title="Delete comment"
                  >
                    <Codicon name="close" size="0.625rem" />
                  </button>
                </div>
                <p className="text-xs text-(--ui-text-primary)">{comment.body}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-[0.6875rem] italic text-(--ui-text-tertiary/60)">No comments yet.</p>
            )}
          </div>

          {/* Add comment */}
          <div className="flex gap-2">
            <Textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              className="min-h-0 flex-1 text-xs"
            />
            <Button
              variant="default"
              size="sm"
              className="self-end"
              onClick={handleSubmitComment}
              disabled={!commentText.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// KanbanView — main exported component
// ---------------------------------------------------------------------------

interface KanbanViewProps {
  setStatusbarItemGroup: SetStatusbarItemGroup
}

export function KanbanView({ setStatusbarItemGroup: _setStatusbarItemGroup }: KanbanViewProps) {
  const [boards, setBoards] = useState<KanbanBoard[]>([])
  const [activeBoardId, setActiveBoardId] = useState<string>('default')
  const [tasks, setTasks] = useState<KanbanTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<KanbanTask | null>(null)
  const [taskComments, setTaskComments] = useState<KanbanComment[]>([])
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<KanbanTask | null>(null)
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardTitle, setNewBoardTitle] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<KanbanTask | null>(null)

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Load boards and tasks
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [boardList, allTasks] = await Promise.all([
        window.hermesDesktop.kanban.boards(),
        window.hermesDesktop.kanban.allTasks()
      ])
      setBoards(boardList)
      setTasks(allTasks)
      if (boardList.length > 0 && !boardList.find(b => b.id === activeBoardId)) {
        setActiveBoardId(boardList[0].id)
      }
    } catch (err) {
      notifyError('Failed to load kanban data')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeBoardId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Load comments for selected task
  useEffect(() => {
    if (!selectedTask) {
      setTaskComments([])
      return
    }
    let cancelled = false
    window.hermesDesktop.kanban.comments(selectedTask.id).then(comments => {
      if (!cancelled) setTaskComments(comments)
    }).catch(() => {
      if (!cancelled) setTaskComments([])
    })
    return () => { cancelled = true }
  }, [selectedTask])

  // Filter tasks by active board and group by status
  const boardTasks = useMemo(
    () => tasks.filter(t => t.boardId === activeBoardId),
    [tasks, activeBoardId]
  )

  const tasksByStatus = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {}
    for (const col of STATUS_COLUMNS) {
      map[col.id] = boardTasks.filter(t => t.status === col.id)
    }
    return map
  }, [boardTasks])

  // Handle drag end - update task status/order
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const draggedTask = tasks.find(t => t.id === active.id)
      const overTask = tasks.find(t => t.id === over.id)

      if (!draggedTask) return

      // Determine target status from the column the item was dropped on
      let targetStatus = draggedTask.status
      if (overTask) {
        targetStatus = overTask.status
      }

      // Update task status
      if (targetStatus !== draggedTask.status) {
        try {
          const updated = await window.hermesDesktop.kanban.updateTask(draggedTask.id, { status: targetStatus })
          setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
        } catch {
          notifyError('Failed to update task status')
        }
      } else {
        // Reorder within the same column
        const columnTasks = tasksByStatus[targetStatus] ?? []
        const oldIdx = columnTasks.findIndex(t => t.id === active.id)
        const newIdx = columnTasks.findIndex(t => t.id === over.id)
        if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
          // In a real app we'd persist ordering; for now just update local
          notify('Task reordered')
        }
      }
    },
    [tasks, tasksByStatus]
  )

  // Create task
  const handleCreateTask = useCallback(
    async (data: { title: string; description?: string; priority?: string; assignee?: string; status?: string }) => {
      try {
        const task = await window.hermesDesktop.kanban.createTask({
          boardId: activeBoardId,
          ...data
        })
        setTasks(prev => [...prev, task])
        notify('Task created')
      } catch {
        notifyError('Failed to create task')
      }
    },
    [activeBoardId]
  )

  // Update task
  const handleUpdateTask = useCallback(
    async (data: { title: string; description?: string; priority?: string; assignee?: string; status?: string }) => {
      if (!editingTask) return
      try {
        const updated = await window.hermesDesktop.kanban.updateTask(editingTask.id, data)
        setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
        setSelectedTask(prev => (prev?.id === updated.id ? updated : prev))
        notify('Task updated')
      } catch {
        notifyError('Failed to update task')
      }
    },
    [editingTask]
  )

  // Delete task
  const handleDeleteTask = useCallback(async () => {
    if (!deletingTask) return
    try {
      await window.hermesDesktop.kanban.deleteTask(deletingTask.id)
      setTasks(prev => prev.filter(t => t.id !== deletingTask.id))
      setSelectedTask(prev => (prev?.id === deletingTask.id ? null : prev))
      setDeletingTask(null)
      setShowDeleteConfirm(null)
      notify('Task deleted')
    } catch {
      notifyError('Failed to delete task')
    }
  }, [deletingTask])

  // Archive task
  const handleArchiveTask = useCallback(async () => {
    if (!selectedTask) return
    try {
      await window.hermesDesktop.kanban.updateTask(selectedTask.id, { archived: true })
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id))
      setSelectedTask(null)
      notify('Task archived')
    } catch {
      notifyError('Failed to archive task')
    }
  }, [selectedTask])

  // Change task status (from detail panel)
  const handleStatusChange = useCallback(
    async (status: string) => {
      if (!selectedTask) return
      try {
        const updated = await window.hermesDesktop.kanban.updateTask(selectedTask.id, { status })
        setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
        setSelectedTask(updated)
      } catch {
        notifyError('Failed to update status')
      }
    },
    [selectedTask]
  )

  // Add comment
  const handleAddComment = useCallback(
    async (body: string) => {
      if (!selectedTask) return
      try {
        const comment = await window.hermesDesktop.kanban.addComment({
          taskId: selectedTask.id,
          author: selectedTask.assignee || 'User',
          body
        })
        setTaskComments(prev => [...prev, comment])
      } catch {
        notifyError('Failed to add comment')
      }
    },
    [selectedTask]
  )

  // Delete comment
  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await window.hermesDesktop.kanban.deleteComment(commentId)
        setTaskComments(prev => prev.filter(c => c.id !== commentId))
      } catch {
        notifyError('Failed to delete comment')
      }
    },
    []
  )

  // Create board
  const handleCreateBoard = useCallback(async () => {
    if (!newBoardTitle.trim()) return
    try {
      const board = await window.hermesDesktop.kanban.createBoard({ title: newBoardTitle.trim() })
      setBoards(prev => [...prev, board])
      setActiveBoardId(board.id)
      setNewBoardTitle('')
      setShowNewBoard(false)
    } catch {
      notifyError('Failed to create board')
    }
  }, [newBoardTitle])

  if (loading) {
    return <PageLoader />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header toolbar */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 border-b border-(--ui-stroke-secondary)',
          'bg-(--ui-bg-primary) py-2',
          PAGE_INSET_X
        )}
      >
        {/* Board selector */}
        <div className="flex items-center gap-1.5">
          <Codicon name="project" size="1rem" className="text-(--ui-text-tertiary)" />
          <select
            className={cn(
              'h-7 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-secondary) px-2 text-xs text-(--ui-text-primary) outline-none',
              'focus:border-(--ui-stroke-tertiary) focus:ring-[0.125rem] focus:ring-ring/30'
            )}
            value={activeBoardId}
            onChange={e => setActiveBoardId(e.target.value)}
          >
            {boards.length === 0 && <option value="default">Default Board</option>}
            {boards.map(board => (
              <option key={board.id} value={board.id}>
                {board.title}
              </option>
            ))}
          </select>
        </div>

        {/* New board button */}
        <button
          className="flex h-7 w-7 items-center justify-center rounded text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-(--ui-text-primary)"
          onClick={() => setShowNewBoard(!showNewBoard)}
          title="New board"
        >
          <Codicon name="add" size="0.875rem" />
        </button>

        {/* New board inline form */}
        {showNewBoard && (
          <div className="flex items-center gap-1.5">
            <Input
              value={newBoardTitle}
              onChange={e => setNewBoardTitle(e.target.value)}
              placeholder="Board name"
              className="h-7 w-40 text-xs"
              autoFocus
            />
            <Button variant="default" size="xs" onClick={handleCreateBoard} disabled={!newBoardTitle.trim()}>
              Create
            </Button>
            <Button variant="ghost" size="xs" onClick={() => { setShowNewBoard(false); setNewBoardTitle('') }}>
              Cancel
            </Button>
          </div>
        )}

        <span className="text-(--ui-stroke-secondary)">|</span>

        {/* New task button */}
        <Button
          variant="default"
          size="sm"
          onClick={() => {
            setEditingTask(null)
            setDialogOpen(true)
          }}
        >
          <Codicon name="add" size="0.75rem" />
          New Task
        </Button>

        {/* Stats */}
        <span className="ml-auto text-[0.65rem] text-(--ui-text-tertiary)">
          {boardTasks.length} task{boardTasks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Kanban board columns */}
      <div className="flex flex-1 gap-4 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {STATUS_COLUMNS.map(column => (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasksByStatus[column.id] ?? []}
              onEditTask={task => {
                setEditingTask(task)
                setDialogOpen(true)
              }}
              onDeleteTask={task => {
                setDeletingTask(task)
                setShowDeleteConfirm(task)
              }}
            />
          ))}
        </DndContext>
      </div>

      {/* Detail panel (slides in on the right) */}
      {selectedTask && (
        <div className="absolute bottom-0 right-0 top-0 w-80">
          <TaskDetailPanel
            task={selectedTask}
            comments={taskComments}
            onClose={() => setSelectedTask(null)}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onArchive={handleArchiveTask}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}

      {/* Create / Edit dialog */}
      <TaskDialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open)
          if (!open) setEditingTask(null)
        }}
        task={editingTask}
        onSave={data => {
          if (editingTask) {
            void handleUpdateTask(data)
          } else {
            void handleCreateTask(data)
          }
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!showDeleteConfirm} onOpenChange={open => { if (!open) { setShowDeleteConfirm(null); setDeletingTask(null) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{showDeleteConfirm?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowDeleteConfirm(null); setDeletingTask(null) }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteTask()}>
              <Codicon name="trash" size="0.75rem" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
