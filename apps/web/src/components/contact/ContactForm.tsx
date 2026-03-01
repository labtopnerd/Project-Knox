'use client'

import { useState } from 'react'
import { Send, Phone, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import type { Representative } from '@project-knox/types'
import { apiFetch } from '@/lib/api-client'

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
      await apiFetch(`/api/contact/${rep.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, channel, subject, body }),
      })
      setSubmitted(true)
      if (channel === 'form' && rep.contactFormUrl) {
        window.open(rep.contactFormUrl, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-support/30 bg-support/10 p-5 text-center">
        <p className="font-semibold text-support dark:text-green-400">Message logged!</p>
        <p className="mt-1 text-sm text-muted-foreground">
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
      {/* Quick contact links */}
      {(rep.phone ?? rep.contactFormUrl) && (
        <div className="flex flex-wrap gap-2">
          {rep.phone && (
            <a
              href={`tel:${rep.phone}`}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
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
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Official contact form
            </a>
          )}
        </div>
      )}

      {/* Templates */}
      {billTitle && (
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Quick templates:</p>
          <div className="flex flex-wrap gap-2">
            {MESSAGE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => handleTemplate(tpl)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-navy-900 hover:bg-navy-900/10 hover:text-navy-900 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors"
              >
                {tpl.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Channel */}
      <div>
        <Label className="mb-2 block">Send via</Label>
        <div className="flex gap-4">
          {(['email', 'form'] as const).map((ch) => (
            <label key={ch} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="channel"
                value={ch}
                checked={channel === ch}
                onChange={() => setChannel(ch)}
                className="accent-navy-900"
              />
              {ch === 'email' ? 'Email' : 'Web form'}
            </label>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <Label htmlFor="contact-subject">Subject</Label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line..."
        />
      </div>

      {/* Body */}
      <div className="space-y-1.5">
        <Label htmlFor="contact-body">Message</Label>
        <textarea
          id="contact-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          required
          minLength={10}
          placeholder="Your message..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Personalize the message with your name and address before sending.
        </p>
      </div>

      <Button
        type="submit"
        disabled={submitting || body.length < 10}
        className="bg-navy-900 text-white hover:bg-navy-800"
      >
        <Send className="mr-2 h-4 w-4" />
        {submitting ? 'Logging...' : 'Log message'}
      </Button>
    </form>
  )
}
