'use client'

import { useRouter } from 'next/navigation'
import {
  IconLayoutDashboard, IconCalendarPlus, IconUsers,
  IconStethoscope, IconCash, IconFileInvoice,
  IconBell, IconLogout, IconUsersGroup, IconMicroscope,
  IconReportAnalytics
} from '@tabler/icons-react'

const allNavItems = [
  { label: 'Dashboard', icon: IconLayoutDashboard, href: '/dashboard', roles: ['admin', 'finance'] },
  { label: 'จองคิว', icon: IconCalendarPlus, href: '/bookings', roles: ['admin'] },
  { label: 'ลูกค้า', icon: IconUsers, href: '/customers', roles: ['admin'] },
  { label: 'ทีมแพทย์', icon: IconStethoscope, href: '/medical', roles: ['admin', 'doctor'] },
  { label: 'ตรวจพิเศษ', icon: IconMicroscope, href: '/special-exams', roles: ['admin', 'doctor', 'finance'] },
  { label: 'การเงิน', icon: IconCash, href: '/payments', roles: ['admin', 'finance'] },
  { label: 'ใบวางบิล', icon: IconFileInvoice, href: '/invoices', roles: ['admin', 'finance'] },
  { label: 'รายงานรายวัน', icon: IconReportAnalytics, href: '/daily-report', roles: ['admin', 'finance'] },
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
    <div className="w-56 bg-white border-r border-gray-100 flex flex-col fixed h-full shadow-sm">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#185FA5] rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">TX</span>
          </div>
          <div>
            <p className="text-[#185FA5] font-semibold text-sm leading-tight">Txrx Service</p>
            <p className="text-xs text-gray-400">ระบบจัดการสุขภาพ</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {allNavItems.filter(item => item.roles.includes(role)).map((item) => {
          const isActive = currentPath === item.href
          return (
            <div key={item.label} onClick={() => router.push(item.href)}
              className={`flex items-center gap-2.5 mx-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all mb-0.5 ${
                isActive
                  ? 'bg-[#185FA5] text-white font-medium shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}>
              <item.icon size={16} className={isActive ? 'text-white' : 'text-gray-400'}/>
              <span>{item.label}</span>
            </div>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-xl">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
            role === 'admin' ? 'bg-[#185FA5] text-white' :
            role === 'doctor' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {role === 'admin' ? 'A' : role === 'doctor' ? 'D' : 'F'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400">
              {role === 'admin' ? 'Admin' : role === 'doctor' ? 'ทีมแพทย์' : 'บัญชี'}
            </p>
          </div>
          <button onClick={onLogout} className="p-1 rounded-lg hover:bg-red-50 transition-colors">
            <IconLogout size={14} className="text-gray-400 hover:text-red-500"/>
          </button>
        </div>
      </div>
    </div>
  )
}