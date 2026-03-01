import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Link2 } from 'lucide-react'

interface RelatedBill {
  title: string
  billNumber: string
  url: string
  relationshipType: string
}

interface Props {
  relatedBills: RelatedBill[]
}

export function RelatedBills({ relatedBills }: Props) {
  if (!relatedBills.length) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Related legislation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {relatedBills.map((bill, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-navy-900 dark:text-blue-400">
                    {bill.billNumber}
                  </span>
                  <Badge variant="secondary" className="text-xs font-normal capitalize">
                    {bill.relationshipType.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{bill.title}</p>
              </div>
              {bill.url && (
                <a
                  href={bill.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`View ${bill.billNumber}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
