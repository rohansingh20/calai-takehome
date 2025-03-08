import { type NextRequest, NextResponse } from "next/server"

// Make sure to export the POST function correctly
export async function POST(request: NextRequest) {
  console.log("API route handler called: /api/process")

  try {
    const formData = await request.formData()
    const image = formData.get("image") as File

    if (!image) {
      console.log("No image provided in request")
      return NextResponse.json({ error: "No image provided" }, { status: 400 })
    }

    console.log(`Image received: ${image.name}, ${image.type}, ${image.size} bytes`)

    // Convert the file to a buffer
    const bytes = await image.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Create a new FormData to send to the processor service
    const processorFormData = new FormData()
    const imageBlob = new Blob([buffer], { type: image.type })
    processorFormData.append("image", imageBlob, image.name)

    // Send the image to the processor service
    const processorUrl = process.env.PROCESSOR_SERVICE_URL || "http://localhost:3001/api/process"
    console.log("Sending request to processor service at:", processorUrl)

    try {
      const processorResponse = await fetch(processorUrl, {
        method: "POST",
        body: processorFormData,
        signal: AbortSignal.timeout(30000),
      })

      console.log("Processor response status:", processorResponse.status)

      // Check if the response is JSON
      const contentType = processorResponse.headers.get("content-type")
      console.log("Processor response content type:", contentType)

      if (!contentType || !contentType.includes("application/json")) {
        const textResponse = await processorResponse.text()
        console.error("Non-JSON response received from processor:", textResponse)
        return NextResponse.json(
          { error: `The processing service returned an invalid response (${processorResponse.status})` },
          { status: 502 },
        )
      }

      if (!processorResponse.ok) {
        const errorData = await processorResponse.json()
        return NextResponse.json(
          { error: errorData.error || `Processing service error (${processorResponse.status})` },
          { status: processorResponse.status },
        )
      }

      const result = await processorResponse.json()
      console.log("Successfully processed image, returning result")
      return NextResponse.json(result)
    } catch (fetchError) {
      console.error("Error fetching from processor service:", fetchError)
      return NextResponse.json(
        {
          error: `Failed to connect to the processor service: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
        },
        { status: 502 },
      )
    }
  } catch (error) {
    console.error("Error processing request:", error)
    return NextResponse.json(
      { error: "Failed to process the image: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 },
    )
  }
}

