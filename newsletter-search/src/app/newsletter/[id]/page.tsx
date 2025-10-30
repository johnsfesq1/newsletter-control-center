'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBestCleanedContent } from '@/lib/newsletter-cleaning';

interface Newsletter {
  id: string;
  sender: string;
  subject: string;
  sent_date: any; // BigQueryTimestamp object
  received_date: any; // BigQueryTimestamp object
  body_text: string;
  body_html: string | null;
  is_vip: boolean;
  publisher_name: string;
  source_type: string;
  word_count: number;
  has_attachments: boolean;
}

export default function NewsletterDetail({ params }: { params: Promise<{ id: string }> }) {
  const [newsletter, setNewsletter] = useState<Newsletter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const fetchNewsletter = async () => {
      try {
        const { id } = await params;
        const response = await fetch(`/api/newsletter/${id}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch newsletter');
        }
        
        setNewsletter(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch newsletter');
      } finally {
        setLoading(false);
      }
    };

    fetchNewsletter();
  }, [params]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('q') || '';
    setSearchQuery(query);
  }, []);

  const formatDate = (dateInput: any) => {
    // Case 1: NULL values
    if (!dateInput) return 'N/A';
    
    // Case 2: BigQueryTimestamp objects (what BigQuery actually returns)
    if (dateInput && typeof dateInput === 'object' && dateInput.value) {
      try {
        const date = new Date(dateInput.value);
        if (isNaN(date.getTime())) {
          return 'Invalid Date';
        }
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (error) {
        return 'Invalid Date';
      }
    }
    
    // Case 3: Date OBJECTS
    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) {
        return 'Invalid Date';
      }
      return dateInput.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    
    // Case 4: String dates
    if (typeof dateInput === 'string') {
      let date: Date;
      if (dateInput.includes('T')) {
        // ISO format with time
        date = new Date(dateInput);
      } else if (dateInput.includes('-')) {
        // Date only format (YYYY-MM-DD)
        date = new Date(dateInput + 'T00:00:00');
      } else {
        // Try parsing as-is
        date = new Date(dateInput);
      }
      
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
    
    // Fallback for unexpected types
    return 'Invalid Date';
  };

  const calculateReadTime = (wordCount: number) => {
    const wordsPerMinute = 200;
    const minutes = Math.ceil(wordCount / wordsPerMinute);
    return minutes;
  };

  const formatContent = (content: string, searchQuery?: string) => {
    if (!content) return [];
    
    // Content is already cleaned when we get it
    const cleanedContent = content;
    
    // Split into paragraphs based on double line breaks
    const paragraphs = cleanedContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    // Highlight search terms if provided
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim();
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      
      return paragraphs.map(paragraph => {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        return sentences.map(sentence => {
          if (regex.test(sentence)) {
            return sentence.replace(regex, '<span class="highlight-sentence">$1</span>');
          }
          return sentence;
        }).join(' ');
      });
    }
    
    return paragraphs;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading newsletter...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-4">
            {error}
          </div>
          <Link 
            href="/"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Back to Search
          </Link>
        </div>
      </div>
    );
  }

  if (!newsletter) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Newsletter not found</p>
          <Link 
            href="/"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            ← Back to Search
          </Link>
        </div>
      </div>
    );
  }

  // Get content - prefer body_text, fallback to stripped HTML
  // Use the shared cleaning utility to get best cleaned content
  const getContent = () => {
    if (!newsletter) return '';
    return getBestCleanedContent(newsletter.body_text || '', newsletter.body_html || '');
  };


  const content = getContent();
  const paragraphs = formatContent(content, searchQuery);
  const readTime = calculateReadTime(newsletter.word_count);

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <div className="sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link 
            href="/"
            className="text-gray-600 hover:text-gray-900 hover:underline text-sm font-medium"
          >
            ← Back to Search
          </Link>
        </div>
      </div>

      {/* Article Container */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Article Header */}
        <article>
          <header className="mb-8">
            <h1 className="text-4xl font-bold leading-tight mb-6">
              {newsletter.subject}
            </h1>
            
            <div className="flex items-center space-x-6 text-gray-600 mb-6">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">{newsletter.publisher_name}</span>
                {newsletter.is_vip && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    VIP
                  </span>
                )}
              </div>
              <span>•</span>
              <time className="text-gray-500">
                {formatDate(newsletter.sent_date)}
              </time>
              <span>•</span>
              <span className="text-gray-500">
                {readTime} min read
              </span>
              <span>•</span>
              <span className="text-gray-500">
                {newsletter.word_count.toLocaleString()} words
              </span>
            </div>
          </header>

          {/* Article Content */}
          <div className="article-content">
            <div className="prose prose-lg max-w-none">
              {paragraphs.length > 0 ? (
                paragraphs.map((paragraph, index) => (
                  <p 
                    key={index} 
                    className="mb-6 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: paragraph }}
                  />
                ))
              ) : (
                <p className="text-gray-500 italic">No content available</p>
              )}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
