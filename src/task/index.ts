import { randomBytes } from 'node:crypto'
export interface Task { id: string; subject: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; owner: string; phase: number }
export interface Plan { id: string; title: string; status: string; tasks: Task[]; createdAt: number }

const plans = new Map<string, Plan>()
export function createPlan(title: string): Plan {
  const p: Plan = { id: `PLAN-${randomBytes(3).toString('hex').toUpperCase()}`, title, status: 'draft', tasks: [], createdAt: Date.now() }
  plans.set(p.id, p); return p
}
export function getPlan(id: string) { return plans.get(id) }
export function listPlans() { return [...plans.values()].sort((a, b) => b.createdAt - a.createdAt) }
export function addTask(planId: string, t: Omit<Task, 'id' | 'status'>) {
  const p = plans.get(planId); if (!p) return
  p.tasks.push({ ...t, id: `${planId}-${p.tasks.length + 1}`, status: 'pending' })
}
