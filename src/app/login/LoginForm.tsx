'use client'

import { useFormStatus } from 'react-dom'
import { Loader2, Lock } from 'lucide-react'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ backgroundColor: '#1773eb' }}
    >
      {pending && <Loader2 size={14} className="animate-spin" />}
      {pending ? 'Checking…' : 'Enter'}
    </button>
  )
}

export default function LoginForm({
  action,
  failed,
}: {
  action: (formData: FormData) => void
  failed: boolean
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div
            className="w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: '#1773eb' }}
          >
            C
          </div>
          <span className="text-xl font-bold text-gray-900">CM Workshop</span>
        </div>

        <form
          action={action}
          className="bg-white border border-gray-200 rounded-xl shadow-sm p-6"
        >
          <div className="flex items-center gap-2 mb-4 text-gray-500">
            <Lock size={13} />
            <span className="text-xs font-medium">This workshop is password protected</span>
          </div>

          <input
            name="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-gray-900 mb-3"
          />

          {failed && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              Incorrect password.
            </p>
          )}

          <SubmitButton />
        </form>
      </div>
    </div>
  )
}
