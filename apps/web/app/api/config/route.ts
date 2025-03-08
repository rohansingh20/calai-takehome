import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    processorUrl: process.env.PROCESSOR_SERVICE_URL || "http://localhost:3001/api/process",
  })
}

