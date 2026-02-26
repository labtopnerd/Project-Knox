/**
 * Auth store — persists JWT token in expo-secure-store.
 * Used across the mobile app for authenticated API calls.
 */

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'knox_jwt'

interface AuthState {
  token: string | null
  isLoading: boolean
  /** Call once on app start to rehydrate token from SecureStore */
  loadToken: () => Promise<void>
  /** Persist token after login */
  setToken: (token: string) => Promise<void>
  /** Clear token on sign-out */
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isLoading: true,

  loadToken: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY)
      set({ token, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  setToken: async (token: string) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
    set({ token })
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    set({ token: null })
  },
}))
