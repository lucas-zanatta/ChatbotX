import { ChevronRightIcon, FolderIcon } from "lucide-react"
import Link from "next/link"
import { getFolderBreadcrumbs } from "../queries/sequence-folders"

type FolderBreadcrumbProps = {
  chatbotId: string
  folder: {
    id: string
    name: string
    parentId?: string | null
  }
}

export async function FolderBreadcrumb({
  chatbotId,
  folder,
}: FolderBreadcrumbProps) {
  const breadcrumbs = await getFolderBreadcrumbs(folder.id)

  return (
    <nav className="flex items-center space-x-2 text-muted-foreground text-sm">
      <Link
        className="flex items-center gap-1 hover:text-foreground"
        href={`/chatbots/${chatbotId}/sequences`}
      >
        <FolderIcon className="h-4 w-4" />
        <span>Tất cả chăm sóc</span>
      </Link>

      {breadcrumbs.map((crumb, index) => (
        <div className="flex items-center gap-2" key={crumb.id}>
          <ChevronRightIcon className="h-4 w-4" />
          {index === breadcrumbs.length - 1 ? (
            <span className="font-medium text-foreground">{crumb.name}</span>
          ) : (
            <Link
              className="hover:text-foreground"
              href={`/chatbots/${chatbotId}/sequences/folders/${crumb.id}`}
            >
              {crumb.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
