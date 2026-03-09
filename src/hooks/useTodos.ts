import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Todo } from '@/types'

export function useTodos(userId: string | undefined) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date().toISOString().split('T')[0]

  const fetchTodos = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('todos')
      .select('*')
      .eq('user_id', userId)
      .or(`date.is.null,date.eq.${today}`)
      .order('created_at')
    setTodos(data ?? [])
    setLoading(false)
  }, [userId, today])

  useEffect(() => { fetchTodos() }, [fetchTodos])

  const pending = todos.filter(t => !t.completed)
  const done = todos.filter(t => t.completed)

  const toggleTodo = async (id: string) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return
    const newVal = !todo.completed
    await supabase.from('todos').update({ completed: newVal }).eq('id', id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: newVal } : t))
  }

  const addTodo = async (title: string, goalId?: string, effort: Todo['effort'] = null, block: Todo['block'] = null) => {
    if (!userId) return
    const { data } = await supabase
      .from('todos')
      .insert({ text: title, goal_id: goalId ?? null, user_id: userId, effort, block, date: today })
      .select()
      .single()
    if (data) setTodos(prev => [...prev, data])
    return data
  }

  const deleteTodo = async (id: string) => {
    await supabase.from('todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  return { todos, pending, done, loading, fetchTodos, toggleTodo, addTodo, deleteTodo }
}
