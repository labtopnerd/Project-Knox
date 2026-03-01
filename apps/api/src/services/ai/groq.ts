/**
 * Groq AI enrichment service — LLaMA 3.3 70B via free-tier API
 * Rate limit: 30 req/min, 14,400 req/day
 * Caller is responsible for a 2100ms delay between calls.
 */

import Groq from 'groq-sdk'
import { z } from 'zod'

const EnrichmentSchema = z.object({
  aiSummary: z.string(),
  keyProvisions: z.array(z.string()),
  whoItAffects: z.array(z.string()),
  proArguments: z.array(z.object({ title: z.string(), description: z.string() })),
  conArguments: z.array(z.object({ title: z.string(), description: z.string() })),
})

export interface BillEnrichmentInput {
  title: string
  summary: string | null
  lastActionText: string | null
  issueTags: string[]
  status: string
  sponsorName?: string
  sponsorParty?: string
  sponsorState?: string
}

export type BillEnrichmentResult = z.infer<typeof EnrichmentSchema>

function buildPrompt(input: BillEnrichmentInput): string {
  const sponsorLine =
    input.sponsorName
      ? `Sponsor: ${input.sponsorName}${input.sponsorParty ? ` (${input.sponsorParty}` : ''}${input.sponsorState ? `, ${input.sponsorState})` : input.sponsorParty ? ')' : ''}`
      : ''

  return `You are a nonpartisan civic information assistant helping citizens understand legislation.
Given the bill details below, produce a balanced structured JSON analysis.

Bill: ${input.title}
Official Summary: ${input.summary ?? 'No summary available'}
Status: ${input.status}, Issue Areas: ${input.issueTags.join(', ') || 'None'}
${sponsorLine}
Last Action: ${input.lastActionText ?? 'None'}

Respond ONLY with valid JSON matching this exact shape — no markdown, no extra text:
{
  "aiSummary": "2-3 sentences plain English, no jargon",
  "keyProvisions": ["What it does — item 1", "item 2", "item 3"],
  "whoItAffects": ["Group — how they are affected", "..."],
  "proArguments": [{"title": "...", "description": "1-2 sentences"}, {"title": "...", "description": "1-2 sentences"}],
  "conArguments": [{"title": "...", "description": "1-2 sentences"}, {"title": "...", "description": "1-2 sentences"}]
}`
}

let _client: Groq | null = null
function getClient(): Groq {
  if (!_client) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY environment variable is required')
    _client = new Groq({ apiKey })
  }
  return _client
}

/**
 * Enrich a bill with AI-generated plain-English summary, provisions, affected groups,
 * and balanced pro/con arguments. Returns null on any error to avoid breaking sync.
 */
export async function enrichBill(input: BillEnrichmentInput): Promise<BillEnrichmentResult | null> {
  try {
    const client = getClient()
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: buildPrompt(input) }],
      temperature: 0.3,
      max_tokens: 1024,
    })

    const text = completion.choices[0]?.message?.content?.trim()
    if (!text) return null

    // Strip any accidental markdown code fences
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return EnrichmentSchema.parse(parsed)
  } catch (err) {
    console.error('[Groq] enrichBill failed:', err instanceof Error ? err.message : err)
    return null
  }
}
