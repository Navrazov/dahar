import { createContext, useContext } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { setOutboxOwner } from '@/shared/api'
import type { User } from '@/shared/api'

export const ME_KEY = ['me'] as const

export const UserContext = createContext<User | null>(null)

export const useUser = () => useContext(UserContext)!

export function signOutLocally(qc: QueryClient) {
  setOutboxOwner(null)
  qc.setQueryData(ME_KEY, null)
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
}

export function signInLocally(qc: QueryClient, user: User) {
  setOutboxOwner(user.id)
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] })
  qc.setQueryData(ME_KEY, user)
}
