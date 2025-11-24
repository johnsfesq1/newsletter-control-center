import { Activity, Clock, FileText, Zap, ChevronRight, Database } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function BentoGrid() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
      <Card className="border-none shadow-sm hover:shadow-md transition-shadow group cursor-pointer bg-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Recent Searches
          </CardTitle>
          <Clock className="h-4 w-4 text-gray-400 group-hover:text-[#2d2dc8] transition-colors" />
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {["Taiwan semiconductors", "Pakistan floods", "European energy"].map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm font-medium text-gray-700 hover:text-[#2d2dc8] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 group-hover:bg-[#2d2dc8]/50 transition-colors"></span>
                  {item}
                </span>
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#2d2dc8]" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm hover:shadow-md transition-shadow group cursor-pointer bg-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Quick Queries</CardTitle>
          <Zap className="h-4 w-4 text-gray-400 group-hover:text-[#2d2dc8] transition-colors" />
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {["Emerging stories", "VIP newsletters", "This week's topics"].map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm font-medium text-gray-700 hover:text-[#2d2dc8] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-100 group-hover:bg-[#2d2dc8] transition-colors"></span>
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm hover:shadow-md transition-shadow relative overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-50/50">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <Activity className="h-32 w-32 text-[#2d2dc8]" />
        </div>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
          <CardTitle className="text-sm font-semibold text-[#2d2dc8] uppercase tracking-wider">System Status</CardTitle>
          <Activity className="h-4 w-4 text-[#2d2dc8]" />
        </CardHeader>
        <CardContent className="relative z-10 pt-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-lg font-bold text-gray-900">Online</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Latency</span>
                <span className="font-mono text-[#2d2dc8]">24ms</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Uptime</span>
                <span className="font-mono text-[#2d2dc8]">99.9%</span>
              </div>
            </div>
            <Badge
              variant="secondary"
              className="mt-2 w-fit bg-[#2d2dc8]/10 text-[#2d2dc8] hover:bg-[#2d2dc8]/20 border-0"
            >
              All systems nominal
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm hover:shadow-md transition-shadow bg-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">This Week</CardTitle>
          <FileText className="h-4 w-4 text-gray-400" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-2xl font-bold text-gray-900 tracking-tight">1,284</div>
              <p className="text-xs text-gray-500 font-medium">Queries processed</p>
            </div>
            <div className="h-px bg-gray-100" />
            <div>
              <div className="text-2xl font-bold text-gray-900 tracking-tight">142</div>
              <p className="text-xs text-gray-500 font-medium">Sources cited</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm hover:shadow-md transition-shadow group cursor-pointer bg-white">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Latest Sources</CardTitle>
          <Database className="h-4 w-4 text-gray-400 group-hover:text-[#2d2dc8] transition-colors" />
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {[
              "Global Trade Outlook 2025",
              "Cybersecurity Trends Report",
              "ASEAN Summit Key Findings",
              "Crypto Regulation Framework",
              "Energy Transition Index",
            ].map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm font-medium text-gray-700 hover:text-[#2d2dc8] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-300 group-hover:bg-[#2d2dc8]/50 transition-colors"></span>
                  <span className="truncate max-w-[140px]">{item}</span>
                </span>
                <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#2d2dc8]" />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}

