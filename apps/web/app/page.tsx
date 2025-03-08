"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Upload, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processorStatus, setProcessorStatus] = useState<"checking" | "online" | "offline">("checking")
  const [apiUrl, setApiUrl] = useState<string>("")

  // Check if the processor service is available on component mount
  useEffect(() => {
    const checkProcessorStatus = async () => {
      try {
        // Try to check processor status directly without relying on our API endpoints
        const processorUrl = "http://localhost:3001/health"
        console.log(`Checking processor health directly at: ${processorUrl}`)

        const response = await fetch(processorUrl, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          // Short timeout to avoid long waits
          signal: AbortSignal.timeout(5000),
        })

        if (!response.ok) {
          throw new Error(`Health check failed with status: ${response.status}`)
        }

        const data = await response.json()
        setProcessorStatus("online")
        setApiUrl("http://localhost:3001/api/process")
      } catch (err) {
        console.error("Processor status check failed:", err)
        setProcessorStatus("offline")
      }
    }

    checkProcessorStatus()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(selectedFile)
      setResult(null)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("image", file)

      // Send the request directly to the processor service instead of through the Next.js API
      const processorUrl = "http://localhost:3001/api/process"
      console.log(`Sending request directly to processor service at: ${processorUrl}`)

      const response = await fetch(processorUrl, {
        method: "POST",
        body: formData,
      })

      // Log the full response for debugging
      console.log("Response status:", response.status)
      console.log("Response headers:", Object.fromEntries([...response.headers.entries()]))

      // Check if the response is JSON
      const contentType = response.headers.get("content-type")
      console.log("Content-Type:", contentType)

      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await response.text()
        console.error("Non-JSON response received:", textResponse)
        throw new Error(`The server returned an invalid response (${response.status}). Please check server logs.`)
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to process image (${response.status})`)
      }

      setResult(data.text)
    } catch (err) {
      console.error("Error in handleSubmit:", err)
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-24">
      <div className="w-full max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">Book Page Extractor</h1>
          <p className="text-muted-foreground mt-2">Upload a book cover image to extract text from its first pages</p>
        </div>

        {processorStatus !== "online" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Service Status</AlertTitle>
            <AlertDescription>
              {processorStatus === "checking"
                ? "Checking processor service status..."
                : "The processor service is currently offline. Some features may not work correctly."}
              {apiUrl && <div className="mt-2 text-xs">Configured processor URL: {apiUrl}</div>}
            </AlertDescription>
          </Alert>
        )}

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid w-full items-center gap-4">
              <div className="flex flex-col space-y-2">
                <label htmlFor="image-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center">
                    {preview ? (
                      <img
                        src={preview || "/placeholder.svg"}
                        alt="Book cover preview"
                        className="max-h-64 object-contain mb-4"
                      />
                    ) : (
                      <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                    )}
                    <p className="text-sm text-muted-foreground">
                      {preview ? "Click to change image" : "Upload a book cover image"}
                    </p>
                  </div>
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!file || loading || processorStatus !== "online"}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Extract Text"
              )}
            </Button>
          </form>
        </Card>

        {error && (
          <Card className="p-6 border-destructive">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-destructive mr-2 mt-0.5" />
              <div>
                <h3 className="font-medium text-destructive">Error</h3>
                <p className="text-destructive">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {result && (
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Extracted Text</h2>
            <Textarea value={result} readOnly className="min-h-[200px]" />
          </Card>
        )}
      </div>
    </main>
  )
}

