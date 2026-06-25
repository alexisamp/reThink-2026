import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { completeOAuthCallback } from '@/lib/authCallback'

export default function AuthCallback({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    completeOAuthCallback()
      .then(result => {
        if (cancelled) return
        if (result.error) {
          setError(result.error)
          localStorage.setItem('rethink_auth_error', result.error)
          return
        }
        setDone(true)
        navigate('/', { replace: true })
      })
      .catch(err => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Could not complete Google sign in.'
        setError(message)
        localStorage.setItem('rethink_auth_error', message)
      })
    return () => { cancelled = true }
  }, [navigate])

  if (signedIn || done) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-xl font-semibold text-burnham mb-3">Google sign-in failed</h1>
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            <button
              className="mt-5 w-full border border-mercury rounded-lg px-4 py-3 text-sm font-medium text-burnham hover:bg-gray-50"
              onClick={() => navigate('/login', { replace: true })}
            >
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 w-6 h-6 border-[1.5px] border-mercury border-t-burnham rounded-full animate-spin" />
            <p className="text-sm text-shuttle">Completing Google sign in...</p>
          </>
        )}
      </div>
    </div>
  )
}
