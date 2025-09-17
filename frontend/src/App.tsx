import { useState } from 'react'
import { Search, Loader2, AlertCircle, CheckCircle2, TrendingUp, Eye, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip } from 'recharts'

interface AnalysisResult {
  url: string
  heuristics: any
  llm_report?: any
}

interface ScoreExplanation {
  name: string
  score: number
  factors: string[]
  tips: string[]
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

const SCORE_EXPLANATIONS = {
  clarity: {
    name: 'Value Proposition Clarity',
    factors: [
      'Page title length and descriptiveness',
      'H1 heading presence and quality',
      'Price visibility and clarity',
      'Subheading structure'
    ],
    tips: [
      'Keep page titles between 30-60 characters',
      'Use clear, benefit-focused H1 headings',
      'Display pricing prominently',
      'Structure content with logical subheadings'
    ]
  },
  cta: {
    name: 'CTA Effectiveness',
    factors: [
      'Call-to-action button presence',
      'CTA positioning above the fold',
      'Price proximity to CTA',
      'Shipping/return info near CTA'
    ],
    tips: [
      'Use action-oriented CTA text',
      'Place primary CTA above the fold',
      'Show price near the CTA button',
      'Include shipping/return info near purchase buttons'
    ]
  },
  trust: {
    name: 'Trust & Social Proof',
    factors: [
      'Customer reviews and ratings',
      'Testimonials count',
      'Average rating quality',
      'Security badges and guarantees'
    ],
    tips: [
      'Display customer reviews prominently',
      'Show star ratings and review counts',
      'Add security badges (SSL, payment)',
      'Include money-back guarantees'
    ]
  },
  visual: {
    name: 'Visual Content',
    factors: [
      'Number of product images',
      'Alt text coverage for accessibility',
      'Image gallery presence',
      'Visual content quality'
    ],
    tips: [
      'Include multiple high-quality product images',
      'Add descriptive alt text for all images',
      'Create image galleries for products',
      'Use professional photography'
    ]
  },
  performance: {
    name: 'Technical Performance',
    factors: [
      'Page size and load speed',
      'Number of external scripts',
      'Meta title and description optimization',
      'Technical SEO elements'
    ],
    tips: [
      'Optimize images and reduce page size',
      'Minimize external JavaScript files',
      'Write compelling meta descriptions',
      'Use proper HTML structure and tags'
    ]
  }
}

function App() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedScore, setSelectedScore] = useState<ScoreExplanation | null>(null)

  const analyzeUrl = async () => {
    if (!url.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    
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
      console.log('Analysis result:', data)
      setResult(data)
    } catch (err) {
      console.error('Analysis error:', err)
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
    if (score >= 7) return 'bg-green-100 hover:bg-green-200'
    if (score >= 4) return 'bg-yellow-100 hover:bg-yellow-200'
    return 'bg-red-100 hover:bg-red-200'
  }

  const handleScoreClick = (scoreType: string, score: number) => {
    const explanation = SCORE_EXPLANATIONS[scoreType as keyof typeof SCORE_EXPLANATIONS]
    if (explanation && result) {
      // Generate specific positives and negatives based on actual data
      const scoreExplanation = generateScoreExplanation(scoreType, score, result.heuristics)
      setSelectedScore({
        name: explanation.name,
        score,
        factors: explanation.factors,
        tips: scoreExplanation
      })
    }
  }

  const generateScoreExplanation = (scoreType: string, _score: number, heuristics: any): string[] => {
    const explanations: string[] = []
    
    switch (scoreType) {
      case 'clarity':
        if (heuristics.title && heuristics.title.length > 10) {
          explanations.push(`+ Descriptive page title: "${heuristics.title.substring(0, 50)}${heuristics.title.length > 50 ? '...' : ''}"`)
        } else {
          explanations.push('- Page title missing or too short')
        }
        
        if (heuristics.h1) {
          explanations.push(`+ Clear H1 heading: "${heuristics.h1.substring(0, 40)}${heuristics.h1.length > 40 ? '...' : ''}"`)
        } else {
          explanations.push('- No H1 heading found')
        }
        
        if (heuristics.price) {
          explanations.push(`+ Price clearly displayed: ${heuristics.price}`)
        } else {
          explanations.push('- Price not found or unclear')
        }
        
        if (heuristics.has_subheadings) {
          explanations.push('+ Content structured with subheadings')
        } else {
          explanations.push('- Content lacks clear subheading structure')
        }
        break

      case 'cta':
        if (heuristics.cta) {
          explanations.push('+ Call-to-action button found')
        } else {
          explanations.push('- No clear call-to-action button detected')
        }
        
        if (heuristics.cta_above_fold) {
          explanations.push('+ CTA appears above the fold')
        } else {
          explanations.push('- CTA not positioned above the fold')
        }
        
        if (heuristics.price_near_cta) {
          explanations.push('+ Price positioned near CTA button')
        } else {
          explanations.push('- Price not close to CTA button')
        }
        
        if (heuristics.shipping_returns_near_cta) {
          explanations.push('+ Shipping/return info near CTA')
        } else {
          explanations.push('- Missing shipping/return info near CTA')
        }
        break

      case 'trust':
        if (heuristics.has_reviews_or_ratings) {
          explanations.push('+ Customer reviews/ratings present')
          if (heuristics.average_rating && heuristics.average_rating >= 4.0) {
            explanations.push(`+ High average rating: ${heuristics.average_rating.toFixed(1)}/5`)
          }
        } else {
          explanations.push('- No customer reviews or ratings visible')
        }
        
        if (heuristics.testimonials > 0) {
          explanations.push(`+ ${heuristics.testimonials} customer testimonials found`)
        } else {
          explanations.push('- No customer testimonials detected')
        }
        
        if (heuristics.security_badges > 0) {
          explanations.push(`+ ${heuristics.security_badges} security badges displayed`)
        } else {
          explanations.push('- No security badges found')
        }
        
        if (heuristics.guarantees > 0) {
          explanations.push('+ Money-back guarantee or warranty mentioned')
        } else {
          explanations.push('- No guarantees or warranties mentioned')
        }
        break

      case 'visual':
        if (heuristics.image_count > 0) {
          explanations.push(`+ ${heuristics.image_count} images found`)
          if (heuristics.image_count >= 3) {
            explanations.push('+ Multiple product images available')
          }
        } else {
          explanations.push('- No images detected')
        }
        
        if (heuristics.alt_coverage && heuristics.alt_coverage >= 0.8) {
          explanations.push(`+ Good alt text coverage: ${(heuristics.alt_coverage * 100).toFixed(0)}%`)
        } else if (heuristics.alt_coverage > 0) {
          explanations.push(`- Poor alt text coverage: ${(heuristics.alt_coverage * 100).toFixed(0)}%`)
        } else {
          explanations.push('- No alt text found on images')
        }
        
        if (heuristics.gallery_present) {
          explanations.push('+ Image gallery detected')
        } else {
          explanations.push('- No image gallery found')
        }
        break

      case 'performance':
        const pageSizeKB = Math.round((heuristics.html_bytes || 0) / 1024)
        if (pageSizeKB < 200) {
          explanations.push(`+ Fast loading page size: ${pageSizeKB} KB`)
        } else if (pageSizeKB < 1000) {
          explanations.push(`+ Reasonable page size: ${pageSizeKB} KB`)
        } else {
          explanations.push(`- Large page size may slow loading: ${pageSizeKB} KB`)
        }
        
        const scriptCount = heuristics.external_script_count || 0
        if (scriptCount < 10) {
          explanations.push(`+ Minimal external scripts: ${scriptCount}`)
        } else if (scriptCount < 20) {
          explanations.push(`+ Moderate script usage: ${scriptCount} external scripts`)
        } else {
          explanations.push(`- Too many external scripts: ${scriptCount}`)
        }
        
        const titleLen = heuristics.meta_title_len || 0
        if (titleLen >= 30 && titleLen <= 60) {
          explanations.push('+ Well-optimized meta title length')
        } else if (titleLen > 0) {
          explanations.push(`- Meta title length needs optimization: ${titleLen} characters`)
        } else {
          explanations.push('- Meta title missing')
        }
        
        if (heuristics.viewport_present) {
          explanations.push('+ Mobile viewport configured')
        } else {
          explanations.push('- Mobile viewport not configured')
        }
        break
    }
    
    return explanations
  }

  // Safe data extraction with fallbacks
  const heuristics = result?.heuristics || {}
  const conversionScores = heuristics.conversion_scores || {}
  const llmReport = result?.llm_report

  // Parse LLM report if it's a string
  let parsedLlmReport = null
  if (llmReport && typeof llmReport === 'string') {
    try {
      parsedLlmReport = JSON.parse(llmReport)
    } catch (e) {
      console.warn('Failed to parse LLM report:', e)
    }
  } else if (llmReport && typeof llmReport === 'object') {
    parsedLlmReport = llmReport
  }

  const chartData = conversionScores ? [
    { name: 'Clarity', value: conversionScores.value_proposition_clarity || 0, color: COLORS[0] },
    { name: 'CTA', value: conversionScores.cta_effectiveness || 0, color: COLORS[1] },
    { name: 'Trust', value: conversionScores.trust_social_proof || 0, color: COLORS[2] },
    { name: 'Visual', value: conversionScores.visual_imagery || 0, color: COLORS[3] },
    { name: 'Performance', value: conversionScores.technical_performance || 0, color: COLORS[4] },
  ] : []

  const overallScore = conversionScores.overall_score || 0

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

        {/* Loading State */}
        {loading && (
          <Card className="mb-8 border border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <p className="text-blue-900">Analyzing page... This may take a moment.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="mb-8 border border-red-200 bg-red-50">
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

        {/* Score Explanation Modal */}
        {selectedScore && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`text-3xl font-bold ${getScoreColor(selectedScore.score)}`}>
                      {selectedScore.score}/10
                    </div>
                    <h2 className="text-xl font-semibold">{selectedScore.name}</h2>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedScore(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">How this score is calculated:</h3>
                    <ul className="space-y-1">
                      {selectedScore.factors.map((factor, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>

      <div>
                    <h3 className="font-medium text-gray-900 mb-2">Score breakdown for this page:</h3>
                    <ul className="space-y-2">
                      {selectedScore.tips.map((explanation, index) => {
                        const isPositive = explanation.startsWith('+')
                        const text = explanation.substring(2) // Remove the + or - prefix
                        return (
                          <li key={index} className={`flex items-start gap-3 p-2 rounded-lg ${
                            isPositive ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                          }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                              isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {isPositive ? '+' : '-'}
                            </div>
                            <span className={`text-sm ${
                              isPositive ? 'text-green-900' : 'text-red-900'
                            }`}>
                              {text}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Debug Info */}
        {result && (
          <Card className="mb-4 border border-gray-200 bg-gray-50">
            <CardContent className="pt-4">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  Debug: Raw Data Structure
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {result && !loading && (
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
                    <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
                      {overallScore.toFixed(1)}
                    </div>
                    <div className="text-2xl text-slate-500">/10</div>
                    <div className="text-sm text-slate-500 mt-2">Overall Score</div>
                  </div>
                </div>

                {parsedLlmReport?.summary && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-blue-900">{parsedLlmReport.summary}</p>
                  </div>
                )}

                {/* Clickable Score Breakdown */}
                {chartData.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Info className="h-4 w-4" />
                      Click on any score to see detailed explanation
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {[
                        { key: 'clarity', data: chartData[0] },
                        { key: 'cta', data: chartData[1] },
                        { key: 'trust', data: chartData[2] },
                        { key: 'visual', data: chartData[3] },
                        { key: 'performance', data: chartData[4] }
                      ].map(({ key, data }) => (
                        <div 
                          key={key}
                          className={`p-4 rounded-lg cursor-pointer transition-colors ${getScoreBgColor(data.value)}`}
                          onClick={() => handleScoreClick(key, data.value)}
                        >
                          <div className="text-center">
                            <div className={`text-2xl font-bold ${getScoreColor(data.value)}`}>
                              {data.value}
                            </div>
                            <div className="text-sm text-slate-600">{data.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Improved Visualizations */}
            {chartData.length > 0 && (
              <div className="grid md:grid-cols-2 gap-8">
                <Card className="border border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Score Breakdown</CardTitle>
                    <CardDescription>Click on bars for detailed explanations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis domain={[0, 10]} />
                        <Tooltip 
                          formatter={(value: any) => [`${value}/10`, 'Score']}
                          labelFormatter={(label) => `${label} Score`}
                        />
                        <Bar 
                          dataKey="value" 
                          fill="#3b82f6"
                          onClick={(data: any) => {
                            const scoreKey = data.name.toLowerCase()
                            handleScoreClick(scoreKey, data.value)
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="border border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Performance Distribution</CardTitle>
                    <CardDescription>Hover for values, click segments for details</CardDescription>
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
                          onClick={(data: any) => {
                            const scoreKey = data.name.toLowerCase()
                            handleScoreClick(scoreKey, data.value)
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {chartData.map((_, idx) => (
                            <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => [`${value}/10`, 'Score']} />
                        <Legend 
                          verticalAlign="bottom" 
                          height={36}
                          formatter={(value) => (
                            <span>
                              {value}
                            </span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Issues and Actions */}
            {parsedLlmReport && (parsedLlmReport.top_issues || parsedLlmReport.quick_wins) && (
              <div className="grid md:grid-cols-2 gap-8">
                {parsedLlmReport.top_issues && (
                  <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-red-600">
                        <AlertCircle className="h-5 w-5" />
                        Top Issues
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {parsedLlmReport.top_issues.map((issue: string, index: number) => (
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
                )}

                {parsedLlmReport.quick_wins && (
                  <Card className="border border-slate-200 bg-white shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="h-5 w-5" />
                        Quick Wins
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {parsedLlmReport.quick_wins.map((win: string, index: number) => (
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
                )}
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
                    <div className="font-medium truncate">{heuristics.title || 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Main Heading</div>
                    <div className="font-medium truncate">{heuristics.h1 || 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Price</div>
                    <div className="font-medium">{heuristics.price || 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Call to Action</div>
                    <div className="font-medium text-xs truncate">{heuristics.cta ? 'Found' : 'Not found'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Images</div>
                    <div className="font-medium">{heuristics.image_count || 0}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Reviews</div>
                    <div className="font-medium">{heuristics.has_reviews_or_ratings ? 'Present' : 'None'}</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">Page Size</div>
                    <div className="font-medium">{Math.round((heuristics.html_bytes || 0) / 1024)} KB</div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-sm text-slate-500">External Scripts</div>
                    <div className="font-medium">{heuristics.external_script_count || 0}</div>
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