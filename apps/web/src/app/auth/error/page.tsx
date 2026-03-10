import Link from 'next/link'

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: 'Error starting the sign-in process. Please try again.',
  OAuthCallback: 'Error during OAuth sign-in. Please try again.',
  OAuthCreateAccount: 'Could not create an account with this provider.',
  EmailCreateAccount: 'Could not create an account with this email.',
  Callback: 'Error during the sign-in callback.',
  OAuthAccountNotLinked:
    'This email is already registered with a different sign-in method. Please use the original method you signed up with.',
  CredentialsSignin: 'Invalid email or password.',
  SessionRequired: 'Please sign in to access this page.',
  Default: 'An unexpected error occurred during sign-in.',
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = ERROR_MESSAGES[error ?? ''] ?? ERROR_MESSAGES.Default

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-4 text-4xl">⚠️</div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">Sign-in error</h1>
        <p className="mb-6 text-sm text-gray-600">{message}</p>
        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Back to sign in
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            Go to homepage
          </Link>
        </div>
      </div>
    </div>
  )
}
