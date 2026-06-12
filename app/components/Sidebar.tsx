'use client'

import { useRouter } from 'next/navigation'
import {
  IconLayoutDashboard, IconCalendarPlus, IconUsers,
  IconStethoscope, IconCash, IconFileInvoice,
  IconBell, IconLogout, IconUsersGroup
} from '@tabler/icons-react'

const allNavItems = [
  { label: 'Dashboard', icon: IconLayoutDashboard, href: '/dashboard', roles: ['admin', 'finance'] },
  { label: 'จองคิว', icon: IconCalendarPlus, href: '/bookings', roles: ['admin'] },
  { label: 'ลูกค้า', icon: IconUsers, href: '/customers', roles: ['admin'] },
  { label: 'ทีมแพทย์', icon: IconStethoscope, href: '/medical', roles: ['admin', 'doctor'] },
  { label: 'การเงิน', icon: IconCash, href: '/payments', roles: ['admin', 'finance'] },
  { label: 'ใบวางบิล', icon: IconFileInvoice, href: '/invoices', roles: ['admin', 'finance'] },
  { label: 'แจ้งเตือน', icon: IconBell, href: '/notifications', roles: ['admin', 'finance'] },
  { label: 'จัดการ User', icon: IconUsersGroup, href: '/users', roles: ['admin'] },
]

interface SidebarProps {
  user: any
  role: string
  currentPath: string
  onLogout: () => void
}

export default function Sidebar({ user, role, currentPath, onLogout }: SidebarProps) {
  const router = useRouter()
  const visibleNav = allNavItems.filter(item => item.roles.includes(role))

  return (
    <div className="w-56 bg-white border-r border-gray-100 flex flex-col fixed h-full">
      <div className="px-5 py-5 border-b border-gray-100">
        <p className="text-[#185FA5] font-medium text-sm">Txrx Service</p>
        <p className="text-xs text-gray-400 mt-0.5">ระบบจัดการตรวจสุขภาพ</p>
      </div>
      <nav className="flex-1 py-2">
        {visibleNav.map((item) => (
          <div key={item.label} onClick={() => router.push(item.href)}
            className={`flex items-center gap-2.5 px-5 py-2.5 text-sm cursor-pointer transition-colors ${
              currentPath === item.href
                ? 'bg-[#E6F1FB] text-[#185FA5] font-medium border-r-2 border-[#185FA5]'
                : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <item.icon size={16} />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100">
        <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-[#E6F1FB] flex items-center justify-center text-xs font-medium text-[#185FA5] flex-shrink-0">
            {role === 'admin' ? 'A' : role === 'doctor' ? 'D' : 'F'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400">
              {role === 'admin' ? 'Admin' : role === 'doctor' ? 'ทีมแพทย์' : 'บัญชี'}
            </p>
          </div>
          <button onClick={onLogout}>
            <IconLogout size={15} className="text-gray-400 hover:text-red-500" />
          </button>
        </div>
      </div>
    </div>
  )
}