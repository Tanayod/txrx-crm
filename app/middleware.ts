import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('sb-access-token')?.value ||
    req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`)?.value

  if (!token) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/bookings/:path*',
    '/customers/:path*',
    '/medical/:path*',
    '/payments/:path*',
    '/invoices/:path*',
    '/notifications/:path*',
  ],
}