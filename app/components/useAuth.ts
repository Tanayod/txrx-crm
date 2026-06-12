'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const ROLE_HOME: any = {
  admin: '/dashboard',
  finance: '/dashboard',
  doctor: '/medical',
}

const PAGE_ROLES: any = {
  '/dashboard': ['admin', 'finance'],
  '/bookings': ['admin'],
  '/customers': ['admin'],
  '/medical': ['admin', 'doctor'],
  '/payments': ['admin', 'finance'],
  '/invoices': ['admin', 'finance'],
  '/notifications': ['admin', 'finance'],
  '/users': ['admin'],
}

export function useAuth(currentPage: string) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: userData } = await supabase
        .from('users').select('role').eq('id', session.user.id).single()

      const userRole = userData?.role || 'admin'
      const allowed = PAGE_ROLES[currentPage] || []

      if (!allowed.includes(userRole)) {
        router.push(ROLE_HOME[userRole] || '/')
        return
      }

      setUser(session.user)
      setRole(userRole)
      setReady(true)
    }
    init()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  return { user, role, ready, logout }
}