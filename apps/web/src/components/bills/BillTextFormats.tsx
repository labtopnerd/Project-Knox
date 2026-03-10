import { CollapsibleCard } from '@/components/ui/collapsible-card'
import { ExternalLink, FileText, FileCode, File } from 'lucide-react'

interface TextFormat {
  type: string
  url: string
}

interface Props {
  textFormats: TextFormat[]
}

const FORMAT_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  'Formatted Text': { label: 'Formatted Text (HTML)', icon: <FileText className="h-4 w-4" /> },
  'PDF': { label: 'PDF', icon: <File className="h-4 w-4" /> },
  'Formatted XML': { label: 'XML', icon: <FileCode className="h-4 w-4" /> },
}

export function BillTextFormats({ textFormats }: Props) {
  if (!textFormats.length) return null

  return (
    <CollapsibleCard
      title="Available text formats"
      description="Download or view the full legislative text in your preferred format."
    >
      <ul className="space-y-2">
        {textFormats.map((f) => {
          const meta = FORMAT_LABELS[f.type] ?? { label: f.type, icon: <FileText className="h-4 w-4" /> }
          return (
            <li key={f.type}>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-navy-900 hover:underline dark:text-blue-400"
              >
                {meta.icon}
                {meta.label}
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </a>
            </li>
          )
        })}
      </ul>
    </CollapsibleCard>
  )
}
