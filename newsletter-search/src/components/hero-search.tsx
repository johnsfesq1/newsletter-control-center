"use client"

import type React from "react"

import { useState } from "react"
import { ArrowRight, Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface HeroSearchProps {
  onSearch: (query: string) => void
  isSearching: boolean
}

export function HeroSearch({ onSearch, isSearching }: HeroSearchProps) {
  const [query, setQuery] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query)
    }
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#2d2dc8] to-[#5454E6] p-8 text-white shadow-lg md:p-12">
      {/* Decorative background elements could go here */}

      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-100/80 text-sm font-medium">
            <span>Nov 23 — November 23, 2025</span>
          </div>
          <Button
            variant="secondary"
            className="hidden bg-white/10 text-white hover:bg-white/20 border-none backdrop-blur-sm sm:flex gap-2"
          >
            VIEW RESULTS <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-indigo-100">
            <span className="text-xl">🌍</span>
            <span className="font-medium tracking-wide text-sm uppercase opacity-90">Intelligence Search</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            SEARCH GEOPOLITICAL INTELLIGENCE
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 md:mt-8">
          <div className="relative group">
            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
              <Search className="h-6 w-6 text-gray-400 group-focus-within:text-[#2d2dc8] transition-colors" />
            </div>
            <Input
              type="text"
              placeholder="What did analysts say about Taiwan semiconductors?"
              className="h-16 w-full rounded-2xl border-0 bg-white pl-14 pr-32 md:pr-40 text-lg text-gray-900 placeholder:text-gray-400 shadow-xl focus-visible:ring-2 focus-visible:ring-white/30"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="absolute inset-y-0 right-2 flex items-center">
              <Button
                type="submit"
                size="sm"
                className="h-12 px-6 rounded-xl bg-[#2d2dc8] hover:bg-[#2222a0] text-white font-medium transition-all shadow-md"
                disabled={!query.trim() || isSearching}
              >
                {isSearching ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Processing
                  </span>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className="flex items-center gap-8 text-sm font-medium mt-4 ml-2">
          <div className={cn("flex items-center gap-2 transition-colors duration-300", !isSearching && "text-white")}>
            <div
              className={cn(
                "flex items-center justify-center w-5 h-5 rounded-full border-2",
                !isSearching ? "bg-white border-white text-[#2d2dc8]" : "border-indigo-200 text-indigo-200",
              )}
            >
              {!isSearching && <span className="text-[10px]">✓</span>}
            </div>
            <span className={!isSearching ? "opacity-100" : "opacity-70"}>Search</span>
          </div>

          <div
            className={cn(
              "flex items-center gap-2 transition-colors duration-300",
              isSearching ? "text-white" : "text-indigo-200",
            )}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                isSearching ? "border-white bg-white/20" : "border-indigo-200/50",
              )}
            >
              {isSearching && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <span className={isSearching ? "opacity-100" : "opacity-60"}>Processing</span>
          </div>

          <div className="flex items-center gap-2 text-indigo-200/60">
            <div className="w-5 h-5 rounded-full border-2 border-current opacity-50" />
            <span className="opacity-60">Results</span>
          </div>
        </div>
      </div>
    </div>
  )
}

