import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://amvezbymrnvrwcypivkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeXBpdmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTIxNTgsImV4cCI6MjA4NDU4ODE1OH0.6qgaygMynKaKYB9TlcJAlyLMt87wc7D8PbA5ZeDGDUg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      // Use chrome.storage instead of localStorage for extension
      getItem: async (key: string) => {
        const result = await chrome.storage.local.get(key)
        return result[key] ?? null
      },
      setItem: async (key: string, value: string) => {
        await chrome.storage.local.set({ [key]: value })
      },
      removeItem: async (key: string) => {
        await chrome.storage.local.remove(key)
      },
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
