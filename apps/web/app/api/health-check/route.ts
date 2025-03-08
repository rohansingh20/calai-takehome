import { NextResponse } from "next/server"

export async function GET() {
  try {
    const processorUrl = process.env.PROCESSOR_SERVICE_URL || "http://localhost:3001/api/process"
    // Extract the base URL (remove the path)
    const baseUrl = processorUrl.split("/api/")[0]
    const healthUrl = `${baseUrl}/health`

    console.log(`Checking processor health at: ${healthUrl}`)

    const response = await fetch(healthUrl, {
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
    return NextResponse.json({
      status: "online",
      details: {
        ...data,
        processorUrl: processorUrl,
      },
    })
  } catch (error) {
    console.error("Health check failed:", error)
    return NextResponse.json(
      { status: "offline", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 },
    )
  }
}

