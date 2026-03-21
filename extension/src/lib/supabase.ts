import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://amvezbymrnvrwcypivkf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtdmV6Ynltcm52cndjeTBwaXZrZiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzA2MjkxNzYzLCJleHAiOjIwMjE4Njc3NjN9.8vDqY0yQN8Z8xQZ0yQZ0yQZ0yQZ0yQZ0yQZ0yQZ0yQZ0'

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
