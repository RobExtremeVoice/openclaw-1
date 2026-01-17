import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, RefreshCw, Download, Clock, Coins, Hash, Zap, TrendingUp, MessagesSquare } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { MessageBubble } from "@/components/features/MessageBubble"
import { getTranscript } from "@/api/observatory"
import { getAgentEmoji, formatCost, formatTokens, formatDuration } from "@/lib/utils"

export function SessionDetail() {
  const { agentId, sessionId } = useParams<{
    agentId: string
    sessionId: string
  }>()
  const navigate = useNavigate()

  const {
    data: transcriptData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["transcript", agentId, sessionId],
    queryFn: () => getTranscript(agentId!, sessionId!),
    enabled: !!agentId && !!sessionId,
    refetchInterval: 10000,
  })

  // Transform transcript entries to message format
  const messages = (transcriptData?.messages || [])
    .filter((entry: any) => entry.type === "message" && entry.message)
    .map((entry: any) => {
      const msg = entry.message
      
      // Handle toolResult role (convert to tool role with tool_result content)
      if (msg.role === "toolResult") {
        const resultContent = Array.isArray(msg.content) 
          ? msg.content.map((c: any) => c.text).join('\n')
          : msg.content
        return {
          role: "tool",
          name: msg.toolName,
          tool_call_id: msg.toolCallId,
          content: resultContent,
          details: msg.details,
          isError: msg.isError,
          timestamp: entry.timestamp,
        }
      }
      
      // Transform content types: toolCall -> tool_use
      let content = msg.content
      if (Array.isArray(content)) {
        content = content.map((c: any) => {
          if (c.type === "toolCall") {
            return { ...c, type: "tool_use", input: c.arguments }
          }
          return c
        })
      }
      // Transform usage format
      const usage = msg.usage ? {
        input_tokens: msg.usage.input || 0,
        output_tokens: msg.usage.output || 0,
        cache_creation_input_tokens: msg.usage.cacheWrite || 0,
        cache_read_input_tokens: msg.usage.cacheRead || 0,
      } : undefined
      // Extract cost
      const cost = msg.usage?.cost?.total || 0
      
      return {
        ...msg,
        content,
        usage,
        cost,
        timestamp: entry.timestamp,
      }
    })

  // Calculate totals
  const totals = messages.reduce(
    (acc, msg) => {
      if (msg.usage) {
        acc.inputTokens += msg.usage.input_tokens || 0
        acc.outputTokens += msg.usage.output_tokens || 0
        acc.cacheCreation += msg.usage.cache_creation_input_tokens || 0
        acc.cacheRead += msg.usage.cache_read_input_tokens || 0
      }
      if (msg.cost) {
        acc.cost += msg.cost
      }
      if (msg.duration) {
        acc.duration += msg.duration
      }
      
      // Count tool calls
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const toolCalls = msg.content.filter((c: any) => c.type === "tool_use")
        acc.toolCalls += toolCalls.length
      }
      
      return acc
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreation: 0,
      cacheRead: 0,
      cost: 0,
      duration: 0,
      toolCalls: 0,
    }
  )

  const downloadTranscript = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transcript-${agentId}-${sessionId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalTokens = totals.inputTokens + totals.outputTokens
  const totalInput = totals.inputTokens + totals.cacheRead
  const cacheHitRate = totalInput > 0 ? (totals.cacheRead / totalInput) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getAgentEmoji(agentId || "")}</span>
              <h1 className="text-2xl font-bold capitalize">{agentId}</h1>
              <Badge variant="outline">Session</Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              {sessionId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/sessions/${agentId}/${sessionId}/trace`)}
          >
            <TrendingUp className="h-4 w-4 mr-2" />
            View Trace
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTranscript}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Hash className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{messages.length}</div>
              <div className="text-xs text-muted-foreground">Messages</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Coins className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-2xl font-bold">
                {formatTokens(totalTokens)}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatTokens(totals.inputTokens)}↓ {formatTokens(totals.outputTokens)}↑
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Zap className="h-5 w-5 text-purple-500" />
            <div>
              <div className="text-2xl font-bold">{totals.toolCalls}</div>
              <div className="text-xs text-muted-foreground">Tool Calls</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Clock className="h-5 w-5 text-orange-500" />
            <div>
              <div className="text-2xl font-bold">
                {formatDuration(totals.duration)}
              </div>
              <div className="text-xs text-muted-foreground">
                Total Duration
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="text-2xl">💰</div>
            <div>
              <div className="text-2xl font-bold">{formatCost(totals.cost)}</div>
              <div className="text-xs text-muted-foreground">Total Cost</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cache Stats */}
      {(totals.cacheCreation > 0 || totals.cacheRead > 0) && (
        <Card className="bg-purple-500/5 border-purple-500/20">
          <CardContent className="flex items-center justify-between gap-6 p-4">
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <div className="font-medium text-sm">Cache Performance</div>
                <div className="text-xs text-muted-foreground">
                  {cacheHitRate.toFixed(1)}% cache hit rate
                </div>
              </div>
            </div>
            <div className="flex gap-6">
              <div className="text-right">
                <div className="text-sm font-mono">{formatTokens(totals.cacheRead)}</div>
                <div className="text-xs text-muted-foreground">Read</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-mono">{formatTokens(totals.cacheCreation)}</div>
                <div className="text-xs text-muted-foreground">Written</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="flex items-center gap-2">
            <span>Conversation</span>
            <Badge variant="secondary" className="font-mono">{messages.length} turns</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-4 p-6">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-550px)] min-h-[400px]">
              <div className="p-4 space-y-3">
                {messages.map((message, index) => (
                  <MessageBubble 
                    key={`${message.role}-${index}`} 
                    message={message}
                  />
                ))}

                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="p-4 rounded-full bg-muted mb-4">
                      <MessagesSquare className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-medium text-foreground">No messages yet</p>
                    <p className="text-sm text-muted-foreground">
                      This session hasn't started
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
