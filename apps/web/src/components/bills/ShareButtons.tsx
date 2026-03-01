'use client'

import { useState } from 'react'
import { Share2, Link as LinkIcon, Check } from 'lucide-react'

interface ShareButtonsProps {
  billTitle: string
  billUrl: string
}

export function ShareButtons({ billTitle, billUrl }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const shareText = `I just looked up "${billTitle}" on Project Knox — see what your reps are voting on:`
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(billUrl)}`

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(billUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = billUrl
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const nativeShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: billTitle, text: shareText, url: billUrl })
      } catch {
        // user dismissed
      }
    } else {
      await copyLink()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Share:</span>

      {/* Copy link */}
      <button
        onClick={copyLink}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
        aria-label="Copy link to bill"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-green-600" />
            <span className="text-green-600">Copied!</span>
          </>
        ) : (
          <>
            <LinkIcon className="h-3.5 w-3.5" />
            Copy link
          </>
        )}
      </button>

      {/* Twitter / X */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
        aria-label="Share on X (Twitter)"
      >
        {/* X logo SVG */}
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
        Post on X
      </a>

      {/* Native share (mobile) */}
      <button
        onClick={nativeShare}
        className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted sm:hidden"
        aria-label="Share via device"
      >
        <Share2 className="h-3.5 w-3.5" />
        More
      </button>
    </div>
  )
}
