import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Sparkles } from 'lucide-react'
import { stripHtml } from '@/lib/utils'

interface Props {
  aiSummary: string | null
  summary: string | null
  keyProvisions?: string[]
  whoItAffects?: string[]
}

export function BillAiSummary({ aiSummary, summary, keyProvisions = [], whoItAffects = [] }: Props) {
  const rawSummary = aiSummary ?? summary
  const displaySummary = rawSummary ? (aiSummary ? rawSummary : stripHtml(rawSummary)) : null
  if (!rawSummary) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">About this bill</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{displaySummary}</p>

        {keyProvisions.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Key provisions</p>
            <ul className="space-y-1.5">
              {keyProvisions.map((provision, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-support" />
                  {provision}
                </li>
              ))}
            </ul>
          </div>
        )}

        {whoItAffects.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Who it affects</p>
            <div className="flex flex-wrap gap-1.5">
              {whoItAffects.map((group, i) => (
                <Badge key={i} variant="secondary" className="text-xs font-normal">
                  {group}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {aiSummary && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground/70">
            <Sparkles className="h-3 w-3" />
            Summary assisted by AI · Always verify with official sources
          </p>
        )}
      </CardContent>
    </Card>
  )
}
