import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AUTH_COOKIE, isAuthConfigured, tokenIsValid } from '@/lib/auth'
import WorkshopApp from '@/components/WorkshopApp'

/**
 * Server-side gate. The app is never sent to the browser unless the session
 * cookie is valid, so the password check cannot be bypassed client-side.
 */
export default async function HomePage() {
  if (isAuthConfigured()) {
    const store = await cookies()
    if (!tokenIsValid(store.get(AUTH_COOKIE)?.value)) {
      redirect('/login')
    }
  }
  return <WorkshopApp />
}
