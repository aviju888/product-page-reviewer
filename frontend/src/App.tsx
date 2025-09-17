import { useState } from 'react'
import { Search, Loader2, AlertCircle, CheckCircle2, TrendingUp, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

interface AnalysisResult {
  url: string
  heuristics: {
    title: string
    h1: string
    price: string
    cta: string
    conversion_scores: {
      overall_score: number
      value_proposition_clarity: number
      cta_effectiveness: number
      trust_social_proof: number
      visual_imagery: number
      technical_performance: number
    }
    image_count: number
    testimonials: number
    has_reviews_or_ratings: boolean
    html_bytes: number
    external_script_count: number
  }
  llm_report?: {
    summary: string
    top_issues: string[]
    quick_wins: string[]
    prioritized_actions: Array<{
      action: string
      why: string
      impact: number
      effort: number
      confidence: number
    }>
  }
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyzeUrl = async () => {
    if (!url.trim()) return

    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!response.ok) {
        throw new Error('Failed to analyze the page')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    analyzeUrl()
  }

  const getScoreColor = (score: number) => {
    if (score >= 7) return 'text-green-600'
    if (score >= 4) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score: number) => {
    if (score >= 7) return 'bg-green-100'
    if (score >= 4) return 'bg-yellow-100'
    return 'bg-red-100'
  }

  const chartData = result ? [
    { name: 'Clarity', value: result.heuristics.conversion_scores.value_proposition_clarity },
    { name: 'CTA', value: result.heuristics.conversion_scores.cta_effectiveness },
    { name: 'Trust', value: result.heuristics.conversion_scores.trust_social_proof },
    { name: 'Visual', value: result.heuristics.conversion_scores.visual_imagery },
    { name: 'Performance', value: result.heuristics.conversion_scores.technical_performance },
  ] : []

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            🔍 Product Page Reviewer
          </h1>
          <p className="text-slate-600 text-lg">
            Analyze any product page for UX wins and conversion opportunities
          </p>
        </div>

        {/* URL Input */}
        <Card className="mb-8 border border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex gap-4">
              <div className="flex-1">
                <Input
                  type="url"
                  placeholder="https://example.com/product/123"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="h-12 text-base border border-slate-300"
                />
                <p className="text-sm text-slate-500 mt-2">
                  💡 Try: socolachocolates.com/collections/chocolate-truffles/products/assorted-chocolate-truffle-box
                </p>
              </div>
              <Button 
                type="submit" 
                disabled={loading || !url.trim()}
                className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="mr-2 h-4 w-4" />
                    Analyze Page
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="mb-8 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <div>
                  <h3 className="font-medium text-red-900">Analysis Failed</h3>
                  <p className="text-red-700">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-8">
            {/* Overall Score */}
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Overall Analysis
                </CardTitle>
                <CardDescription>
                  {result.url}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-center mb-6">
                  <div className="text-center">
                    <div className={`text-6xl font-bold ${getScoreColor(result.heuristics.conversion_scores.overall_score)}`}>
                      {result.heuristics.conversion_scores.overall_score.toFixed(1)}
                    </div>
                    <div className="text-2xl text-slate-500">/10</div>
                    <div className="text-sm text-slate-500 mt-2">Overall Score</div>
                  </div>
                </div>

                {result.llm_report?.summary && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-blue-900">{result.llm_report.summary}</p>
                  </div>
                )}

                {/* Score Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {chartData.map((item) => (
                    <div key={item.name} className={`p-4 rounded-lg ${getScoreBgColor(item.value)}`}>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${getScoreColor(item.value)}`}>
                          {item.value}
                        </div>
                        <div className="text-sm text-slate-600">{item.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Visualizations */}
            <div className="grid md:grid-cols-2 gap-8">
              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 10]} />
                      <Bar dataKey="value" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle>Performance Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        dataKey="value"
                      >
                        {chartData.map((_, idx) => (
                          <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Issues and Actions */}
            {result.llm_report && (
              <div className="grid md:grid-cols-2 gap-8">
                <Card className="border border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="h-5 w-5" />
                      Top Issues
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {result.llm_report.top_issues.map((issue, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                          <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-medium flex-shrink-0">
                            {index + 1}
                          </div>
                          <p className="text-sm text-red-900">{issue}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      Quick Wins
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {result.llm_report.quick_wins.map((win, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                          <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-sm font-medium flex-shrink-0">
                            ✓
                          </div>
                          <p className="text-sm text-green-900">{win}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Key Metrics */}
            <Card className="border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Key Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Page Title</div>
                    <div className="font-medium truncate">{result.heuristics.title || 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Main Heading</div>
                    <div className="font-medium truncate">{result.heuristics.h1 || 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Price</div>
                    <div className="font-medium">{result.heuristics.price || 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Call to Action</div>
                    <div className="font-medium text-xs truncate">{result.heuristics.cta ? 'Found' : 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Images</div>
                    <div className="font-medium">{result.heuristics.image_count || 0}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Reviews</div>
                    <div className="font-medium">{result.heuristics.has_reviews_or_ratings ? 'Present' : 'None'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Page Size</div>
                    <div className="font-medium">{Math.round((result.heuristics.html_bytes || 0) / 1024)} KB</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">External Scripts</div>
                    <div className="font-medium">{result.heuristics.external_script_count || 0}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

export default App