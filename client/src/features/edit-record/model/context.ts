import { createContext, useContext } from 'react'
import type { CollectionName } from '@/shared/api'
import type { Values } from '../config/forms'

export type OpenEditor = (table: CollectionName, initial?: Values, opts?: { onSaved?: (row: any) => void }) => void

export const EditorContext = createContext<OpenEditor>(() => {})

export const useEditor = () => useContext(EditorContext)
