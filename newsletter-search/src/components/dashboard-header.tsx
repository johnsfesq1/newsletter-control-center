import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export function DashboardHeader() {
  return (
    <header className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm text-xl border border-gray-100">
          🌍
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none text-gray-900">International Intrigue</h1>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Intelligence Platform</p>
        </div>
      </div>
      <div className="flex items-center justify-between md:justify-end gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            className="rounded-full bg-[#2d2dc8] hover:bg-[#2222a0] text-white px-5 h-9 text-xs font-semibold shadow-sm"
          >
            📚 Newsletters
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-[#2d2dc8] text-[#2d2dc8] hover:bg-[#2d2dc8] hover:text-white px-5 h-9 text-xs font-semibold bg-transparent shadow-sm"
          >
            🔍 Search
          </Button>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full bg-white text-gray-500 hover:text-gray-900 border-gray-200 shadow-sm"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}

