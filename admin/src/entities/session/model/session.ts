import { createContext, useContext } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { Admin } from '@/shared/api'

export const ME_KEY = ['admin-me'] as const

export const AdminContext = createContext<Admin | null>(null)

export const useAdmin = () => useContext(AdminContext)!

export function signOutLocally(qc: QueryClient) {
  qc.setQueryData(ME_KEY, null)
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
}
