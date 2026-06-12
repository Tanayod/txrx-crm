'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } else {
      window.location.href = '/dashboard'
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 w-full max-w-sm">

        <div className="mb-8">
          <h1 className="text-xl font-medium text-[#185FA5]">Txrx Service</h1>
          <p className="text-sm text-gray-400 mt-1">ระบบจัดการตรวจสุขภาพแรงงาน</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-1.5 block">อีเมล</label>
            <input
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] focus:border-transparent"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-1.5 block">รหัสผ่าน</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#185FA5] focus:border-transparent"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-[#185FA5] text-white rounded-lg py-2.5 text-sm font-medium hover:bg-[#0C447C] transition-colors disabled:opacity-50"
          >
            {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </div>

      </div>
    </div>
  )
}