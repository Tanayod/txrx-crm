'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  IconLayoutDashboard, IconCalendar, IconUsers, IconStethoscope,
  IconMicroscope, IconCash, IconFileInvoice, IconFileReport,
  IconBell, IconSettings, IconLogout, IconChartBar
} from '@tabler/icons-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { href: '/bookings', label: 'จองคิว', icon: IconCalendar },
  { href: '/customers', label: 'ลูกค้า', icon: IconUsers },
  { href: '/medical', label: 'ทีมแพทย์', icon: IconStethoscope },
  { href: '/special-exams', label: 'ตรวจพิเศษ', icon: IconMicroscope },
  { href: '/payments', label: 'การเงิน', icon: IconCash },
  { href: '/invoices', label: 'ใบวางบิล', icon: IconFileInvoice },
  { href: '/finance-report', label: 'Report การเงิน', icon: IconChartBar },
  { href: '/daily-report', label: 'รายงานรายวัน', icon: IconFileReport },
  { href: '/notifications', label: 'แจ้งเตือน', icon: IconBell },
  { href: '/users', label: 'จัดการ User', icon: IconSettings },
]

export default function Sidebar({ user, role, currentPath, onLogout }: {
  user: any, role: string, currentPath: string, onLogout: () => void
}) {
  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-white border-r border-gray-100 flex flex-col z-40 shadow-sm">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#185FA5] rounded-lg flex items-center justify-center text-white font-bold text-sm">TX</div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Txrx Service</p>
            <p className="text-xs text-gray-400">ระบบจัดการสุขภาพ</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {navItems.map(item => {
          const isActive = currentPath === item.href
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm transition-colors ${
                isActive
                  ? 'bg-[#185FA5] text-white font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <item.icon size={16} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center justify-between px-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{user?.email}</p>
            <p className="text-xs text-gray-400 capitalize">{role}</p>
          </div>
          <button onClick={onLogout} className="text-gray-400 hover:text-red-500 transition-colors ml-2 flex-shrink-0">
            <IconLogout size={16}/>
          </button>
        </div>
      </div>
    </div>
  )
}