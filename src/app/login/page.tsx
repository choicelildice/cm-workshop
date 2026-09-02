import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE,
  expectedToken,
  isAuthConfigured,
  passwordIsValid,
  tokenIsValid,
} from '@/lib/auth'
import LoginForm from './LoginForm'

export const metadata = { title: 'CM Workshop' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  // Nothing to log into if no password is set, or already signed in
  const store = await cookies()
  if (!isAuthConfigured() || tokenIsValid(store.get(AUTH_COOKIE)?.value)) {
    redirect('/')
  }

  const { error } = await searchParams

  async function submit(formData: FormData) {
    'use server'
    const password = String(formData.get('password') ?? '')
    if (!passwordIsValid(password)) {
      redirect('/login?error=1')
    }
    const jar = await cookies()
    jar.set(AUTH_COOKIE, expectedToken(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_MAX_AGE,
      path: '/',
    })
    redirect('/')
  }

  return <LoginForm action={submit} failed={error === '1'} />
}
