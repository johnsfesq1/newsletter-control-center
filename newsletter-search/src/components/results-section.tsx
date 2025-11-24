import { ChevronDown, BookOpen, Share2, ThumbsUp, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface SemanticResult {
  query: string;
  answer: string;
  citations: Array<{
    chunk_id: string;
    newsletter_id: string;
    chunk_index?: number;
    citation: string;
    publisher: string;
    date: any;
    subject: string;
  }>;
  chunks_used: number;
  cost_usd: number;
  chunks: Array<{
    chunk_id: string;
    newsletter_id: string;
    subject: string;
    publisher: string;
    score: number;
    normalized_score?: number;
  }>;
  publisher_rankings?: Array<{
    publisher: string;
    relevance_score: number;
    chunk_count: number;
    avg_score: number;
    latest_date?: any;
  }>;
}

interface ResultsSectionProps {
  query: string;
  results: SemanticResult;
}

export function ResultsSection({ query, results }: ResultsSectionProps) {
  // Format date helper
  const formatDate = (dateInput: any) => {
    if (!dateInput) return 'Date unknown';
    
    if (dateInput && typeof dateInput === 'object' && dateInput.value) {
      try {
        return new Date(dateInput.value).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } catch {
        return 'Date unknown';
      }
    }
    
    if (typeof dateInput === 'string') {
      try {
        return new Date(dateInput).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        });
      } catch {
        return 'Date unknown';
      }
    }
    
    return 'Date unknown';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-forwards">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Analysis Results</h3>
          <Badge variant="secondary" className="bg-indigo-50 text-[#2d2dc8] border-indigo-100">
            {results.citations.length} Sources Found
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-gray-500">
            <Share2 className="h-4 w-4 mr-2" /> Share
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-gray-500">
            <ThumbsUp className="h-4 w-4 mr-2" /> Feedback
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-md bg-white overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-[#2d2dc8] to-[#5454E6]" />
        <CardContent className="p-6 md:p-10">
          <div className="prose prose-indigo max-w-none text-gray-700">
            <div className="text-lg leading-relaxed text-gray-800 font-medium mb-6 whitespace-pre-wrap">
              {results.answer}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-500">
              <span>Based on {results.chunks_used} relevant chunks</span>
              <span>Est. Cost: ${results.cost_usd.toFixed(4)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {results.citations.map((citation, idx) => (
          <Link 
            key={citation.chunk_id || idx} 
            href={`/newsletter/${citation.newsletter_id}${citation.chunk_index !== undefined ? `?highlight_chunk=${citation.chunk_index}` : ''}`}
            className="block"
          >
            <Card className="group cursor-pointer border border-transparent shadow-sm hover:shadow-lg hover:border-[#2d2dc8]/20 transition-all duration-300 bg-white hover:-translate-y-1 h-full">
              <CardContent className="p-5 flex flex-col h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-900 text-sm group-hover:text-[#2d2dc8] transition-colors line-clamp-1">
                      {citation.publisher}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mt-0.5">
                      Newsletter Issue
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-100 bg-gray-50 shrink-0 ml-2">
                    {formatDate(citation.date)}
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed mb-4 grow font-medium">
                  {citation.subject}
                </p>
                <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-auto">
                  <div className="flex items-center gap-1 text-xs font-semibold text-[#2d2dc8] group-hover:underline">
                    Read Full Issue <ChevronDown className="h-3 w-3" />
                  </div>
                  <ExternalLink className="h-3 w-3 text-gray-300 group-hover:text-[#2d2dc8]" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

