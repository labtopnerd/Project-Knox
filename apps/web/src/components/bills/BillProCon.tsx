import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThumbsUp, ThumbsDown } from 'lucide-react'

interface Argument {
  title: string
  description: string
}

interface Props {
  proArguments: Argument[]
  conArguments: Argument[]
}

export function BillProCon({ proArguments, conArguments }: Props) {
  if (!proArguments.length && !conArguments.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Arguments for &amp; against</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {/* For */}
          {proArguments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-support dark:text-green-400">
                <ThumbsUp className="h-4 w-4" />
                For
              </div>
              <ul className="space-y-3">
                {proArguments.map((arg, i) => (
                  <li key={i} className="rounded-lg border border-support/20 bg-support/5 p-3">
                    <p className="mb-1 text-sm font-medium text-foreground">{arg.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{arg.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Against */}
          {conArguments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-oppose dark:text-red-400">
                <ThumbsDown className="h-4 w-4" />
                Against
              </div>
              <ul className="space-y-3">
                {conArguments.map((arg, i) => (
                  <li key={i} className="rounded-lg border border-oppose/20 bg-oppose/5 p-3">
                    <p className="mb-1 text-sm font-medium text-foreground">{arg.title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">{arg.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-foreground/70">
          AI-generated for informational purposes — not an endorsement of any position
        </p>
      </CardContent>
    </Card>
  )
}
