import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  isAuthConfigured,
  issueToken,
  matchAccessCode,
  tokenIsValid,
} from '@/lib/auth'
import { clearAttempts, registerAttempt } from '@/lib/login-throttle'
import LoginForm from './LoginForm'

export const metadata = { title: 'CM Workshop' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // Nothing to log into if no code is configured, or already signed in
  const store = await cookies()
  if (!isAuthConfigured() || tokenIsValid(store.get(AUTH_COOKIE)?.value)) {
    redirect('/')
  }

  const { error, wait } = (await searchParams) as { error?: string; wait?: string }

  async function submit(formData: FormData) {
    'use server'
    const submitted = String(formData.get('password') ?? '')

    // Throttle by IP before checking, so a wordlist can't be run at speed
    const hdrs = await headers()
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0].trim() ||
      hdrs.get('x-real-ip') ||
      'unknown'
    const { allowed, retryAfterSeconds } = registerAttempt(ip)
    if (!allowed) {
      redirect(`/login?error=throttled&wait=${retryAfterSeconds}`)
    }

    const label = matchAccessCode(submitted)
    if (!label) {
      redirect('/login?error=1')
    }
    // A correct code shouldn't leave the bucket filled for a shared office IP
    clearAttempts(ip)

    const jar = await cookies()
    jar.set(AUTH_COOKIE, issueToken(label), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_MAX_AGE,
      path: '/',
    })
    redirect('/')
  }

  return (
    <LoginForm
      action={submit}
      failed={error === '1'}
      throttled={error === 'throttled'}
      waitSeconds={Number(wait) || 0}
    />
  )
}
