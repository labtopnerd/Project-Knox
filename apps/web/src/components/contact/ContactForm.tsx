'use client'

import { useState } from 'react'
import { Send, Phone, ExternalLink } from 'lucide-react'
import type { Representative } from '@project-knox/types'

interface ContactFormProps {
  rep: Representative
  billId?: string
  billTitle?: string
}

const MESSAGE_TEMPLATES = [
  {
    label: 'Support this bill',
    subject: (billTitle: string) => `I Support: ${billTitle}`,
    body: (repName: string, billTitle: string) =>
      `Dear ${repName},\n\nI am writing as your constituent to express my strong support for ${billTitle}.\n\nThis legislation is important to me because [explain why it matters to you personally].\n\nI urge you to vote YES on this bill.\n\nThank you for your service and for considering my view.\n\nSincerely,\n[Your Name]\n[Your Address]`,
  },
  {
    label: 'Oppose this bill',
    subject: (billTitle: string) => `I Oppose: ${billTitle}`,
    body: (repName: string, billTitle: string) =>
      `Dear ${repName},\n\nI am writing as your constituent to express my concerns about ${billTitle}.\n\nI urge you to vote NO on this bill because [explain your concerns].\n\nThank you for your service and for representing our district.\n\nSincerely,\n[Your Name]\n[Your Address]`,
  },
  {
    label: 'Request information',
    subject: (billTitle: string) => `Constituent Question: ${billTitle}`,
    body: (repName: string, billTitle: string) =>
      `Dear ${repName},\n\nAs your constituent, I would like to understand your position on ${billTitle} and how it might affect our community.\n\nCould you please share your thoughts on this legislation?\n\nThank you for your time.\n\nSincerely,\n[Your Name]\n[Your Address]`,
  },
]

export function ContactForm({ rep, billId, billTitle }: ContactFormProps) {
  const [subject, setSubject] = useState(billTitle ? `Re: ${billTitle}` : '')
  const [body, setBody] = useState('')
  const [channel, setChannel] = useState<'email' | 'form'>('email')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleTemplate = (tpl: (typeof MESSAGE_TEMPLATES)[0]) => {
    if (!billTitle || !rep.fullName) return
    setSubject(tpl.subject(billTitle))
    setBody(tpl.body(rep.fullName, billTitle))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
      await fetch(`${apiUrl}/api/contact/${rep.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ billId, channel, subject, body }),
      })
      setSubmitted(true)

      // Open official contact form if that's the chosen channel
      if (channel === 'form' && rep.contactFormUrl) {
        window.open(rep.contactFormUrl, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center">
        <p className="text-lg font-semibold text-green-800">Message logged!</p>
        <p className="mt-1 text-sm text-green-600">
          {channel === 'form' && rep.contactFormUrl
            ? 'The official contact form should have opened in a new tab.'
            : rep.email
            ? `You can send it to ${rep.email}`
            : 'Your message has been saved.'}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Quick contact options */}
      <div className="flex flex-wrap gap-2">
        {rep.phone && (
          <a
            href={`tel:${rep.phone}`}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Phone className="h-4 w-4" />
            {rep.phone}
          </a>
        )}
        {rep.contactFormUrl && (
          <a
            href={rep.contactFormUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" />
            Official contact form
          </a>
        )}
      </div>

      {/* Templates */}
      {billTitle && (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Quick templates:</p>
          <div className="flex flex-wrap gap-2">
            {MESSAGE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => handleTemplate(tpl)}
                className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Channel selection */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Send via</label>
        <div className="flex gap-3">
          {['email', 'form'].map((ch) => (
            <label key={ch} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="channel"
                value={ch}
                checked={channel === ch}
                onChange={() => setChannel(ch as 'email' | 'form')}
                className="text-primary-600"
              />
              {ch === 'email' ? 'Email' : 'Web form'}
            </label>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="subject">
          Subject
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Subject line..."
        />
      </div>

      {/* Body */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="body">
          Message
        </label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          required
          minLength={10}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Your message..."
        />
        <p className="mt-1 text-xs text-gray-400">
          Personalize the message with your name and address before sending.
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting || body.length < 10}
        className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {submitting ? 'Logging...' : 'Log message'}
      </button>
    </form>
  )
}
