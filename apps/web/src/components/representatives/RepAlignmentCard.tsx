import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThumbsUp, ThumbsDown, Minus, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  repName: string
  agreed: number
  disagreed: number
  neutral: number
}

export function RepAlignmentCard({ repName, agreed, disagreed, neutral }: Props) {
  const total = agreed + disagreed
  if (total === 0) {
    const totalVoted = neutral
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Your alignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {totalVoted > 0
              ? `You voted neutral on ${totalVoted} bill${totalVoted > 1 ? 's' : ''} ${repName.split(' ').pop()} sponsored. Cast support or oppose votes on their bills to see your alignment score.`
              : `Vote on bills sponsored by ${repName.split(' ').pop()} to see how often you agree.`}
          </p>
        </CardContent>
      </Card>
    )
  }

  const percent = Math.round((agreed / total) * 100)
  const disagreedPercent = Math.round((disagreed / total) * 100)

  const barColor =
    percent >= 70 ? 'bg-support' :
    percent >= 40 ? 'bg-yellow-500' :
    'bg-oppose'

  const label =
    percent >= 70 ? 'Strong alignment' :
    percent >= 40 ? 'Mixed alignment' :
    'Low alignment'

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Your alignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-3xl font-bold text-foreground">{percent}%</span>
            <span className="ml-2 text-sm text-muted-foreground">{label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{total} bill{total > 1 ? 's' : ''} compared</span>
        </div>

        {/* Bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full transition-all', barColor)} style={{ width: `${percent}%` }} />
          <div className="h-full bg-oppose" style={{ width: `${disagreedPercent}%` }} />
        </div>

        {/* Counts */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5 text-support" />
            {agreed} agreed
          </span>
          <span className="flex items-center gap-1">
            <ThumbsDown className="h-3.5 w-3.5 text-oppose" />
            {disagreed} disagreed
          </span>
          {neutral > 0 && (
            <span className="flex items-center gap-1">
              <Minus className="h-3.5 w-3.5" />
              {neutral} neutral
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground/70">
          Based on bills sponsored by {repName.split(',')[0]}. Vote on more of their bills to improve accuracy.
        </p>
      </CardContent>
    </Card>
  )
}
