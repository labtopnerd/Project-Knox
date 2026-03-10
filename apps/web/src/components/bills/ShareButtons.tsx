'use client'

import { useState } from 'react'
import { Share2, Link as LinkIcon, Check } from 'lucide-react'

interface ShareButtonsProps {
  title: string
  url: string
  text?: string
}

export function ShareButtons({ title, url, text }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false)

  const shareText = text ?? `Check out "${title}" on Project Knox:`
  const encodedText = encodeURIComponent(shareText)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodedText}%20${encodedUrl}`
  const redditUrl = `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
  const truthUrl = `https://truthsocial.com/share?text=${encodedText}%20${encodedUrl}`

  const pillClass =
    'flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted'

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const input = document.createElement('input')
      input.value = url
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
        await navigator.share({ title, text: shareText, url })
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
      <button onClick={copyLink} className={pillClass} aria-label="Copy link">
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

      {/* X / Twitter */}
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label="Share on X (Twitter)">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
        Post on X
      </a>

      {/* Facebook */}
      <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label="Share on Facebook">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
        </svg>
        Facebook
      </a>

      {/* Bluesky */}
      <a href={blueskyUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label="Share on Bluesky">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.077.987.52 1.771c-.556.785-.1 2.45.616 3.464.716 1.013 1.823 1.955 2.93 2.37-.01.009-2.985.702-2.985 3.123 0 2.041 2.168 2.758 3.654 2.399-.01.01 1.21 3.46 7.265 4.882C17.8 16.13 19.02 12.68 19.01 12.67c1.486.36 3.654-.358 3.654-2.399 0-2.421-2.976-3.114-2.986-3.124 1.108-.414 2.215-1.356 2.93-2.37.717-1.013 1.172-2.678.616-3.463-.557-.784-2.046-.827-4.682.834C15.79 4.109 13.087 8.686 12 10.8zm0 3.11c-3.5 1.553-6.5 1.553-6.5 1.553s-.5 3.5 6.5 3.5 6.5-3.5 6.5-3.5-3-.001-6.5-1.553z" />
        </svg>
        Bluesky
      </a>

      {/* Reddit */}
      <a href={redditUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label="Share on Reddit">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
        </svg>
        Reddit
      </a>

      {/* LinkedIn */}
      <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label="Share on LinkedIn">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
        LinkedIn
      </a>

      {/* TruthSocial */}
      <a href={truthUrl} target="_blank" rel="noopener noreferrer" className={pillClass} aria-label="Share on Truth Social">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 7H6.5V5h11v2zm-3 10h-2V9h2v8z" />
        </svg>
        Truth
      </a>

      {/* Native share (mobile only) */}
      <button
        onClick={nativeShare}
        className={`${pillClass} sm:hidden`}
        aria-label="Share via device"
      >
        <Share2 className="h-3.5 w-3.5" />
        More
      </button>
    </div>
  )
}
