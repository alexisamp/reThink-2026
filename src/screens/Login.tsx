import { supabase } from '@/lib/supabase'
import { GOOGLE_OAUTH_SCOPES_STRING, markGoogleDriveScopeRequested } from '@/lib/googleDrive'

export default function Login() {
  const signInWithGoogle = () => {
    markGoogleDriveScopeRequested()
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: GOOGLE_OAUTH_SCOPES_STRING,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  }

  return (
    <div className="login-screen min-h-screen bg-white text-burnham flex items-center justify-center px-6">
      <div className="w-full max-w-[392px]">
        <div className="mb-9 text-center">
          <div className="inline-flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-[8px] bg-burnham flex items-center justify-center shadow-none">
              <span className="text-white text-[13px] font-semibold leading-none">r</span>
            </div>
            <span className="text-[19px] font-semibold text-burnham tracking-normal">reThink</span>
          </div>
          <p className="text-shuttle text-[13px] font-medium leading-5">
            The operating system for mindful ambition
          </p>
        </div>

        <div className="rounded-[8px] border border-mercury bg-white px-6 py-6 shadow-[var(--shadow-card)]">
          <div className="text-center">
            <h1 className="text-[19px] leading-6 font-semibold text-burnham tracking-normal mb-1.5">
              Welcome back
            </h1>
            <p className="text-shuttle text-[13px] leading-5 font-medium">
              Sign in to continue to your 2026 workbook
            </p>
          </div>

          <button
            onClick={signInWithGoogle}
            className="mt-6 w-full h-11 flex items-center justify-center gap-2.5 border border-mercury rounded-[10px] px-4 text-[13px] font-medium text-burnham bg-white hover:bg-[#F4F5F6] hover:border-[#CAD0D9] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="mt-5 border-t border-mercury pt-4">
            <p className="text-center text-[11px] leading-4 font-medium text-shuttle/70">
              2026 Annual Workbook
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
