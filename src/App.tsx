import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

// Screens (lazy-loaded later; for now direct imports)
import Login from '@/screens/Login'
import AppShell from '@/components/layout/AppShell'
import Assessment from '@/screens/Assessment'
import Strategy from '@/screens/Strategy'
import Monthly from '@/screens/Monthly'
import Today from '@/screens/Today'
import Dashboard from '@/screens/Dashboard'
import GoalDetail from '@/screens/GoalDetail'

function Splash() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasWorkbook, setHasWorkbook] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setHasWorkbook(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    const year = new Date().getFullYear()
    supabase
      .from('workbooks')
      .select('id')
      .eq('user_id', user.id)
      .eq('year', year)
      .maybeSingle()
      .then(({ data }) => setHasWorkbook(!!data))
      .catch(() => setHasWorkbook(false))
  }, [user])

  if (loading) return <Splash />

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />

        {/* Assessment (needs auth, no workbook required) */}
        <Route
          path="/assessment/*"
          element={user ? <Assessment onComplete={() => setHasWorkbook(true)} /> : <Navigate to="/login" replace />}
        />

        {/* Protected app */}
        <Route
          path="/*"
          element={
            !user ? (
              <Navigate to="/login" replace />
            ) : hasWorkbook === null ? (
              <Splash />
            ) : !hasWorkbook ? (
              <Navigate to="/assessment" replace />
            ) : (
              <AppShell user={user}>
                <Routes>
                  <Route path="/" element={<Navigate to="/today" replace />} />
                  <Route path="/today" element={<Today />} />
                  <Route path="/strategy" element={<Strategy />} />
                  <Route path="/monthly" element={<Monthly />} />
                  <Route path="/monthly/:goalId" element={<Monthly />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/dashboard/goal/:id" element={<GoalDetail />} />
                  <Route path="*" element={<Navigate to="/today" replace />} />
                </Routes>
              </AppShell>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
