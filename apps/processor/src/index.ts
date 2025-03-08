import express from "express"
import multer from "multer"
import cors from "cors"
import { processBookCover } from "./services/bookProcessor.js"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import fs from "fs"

// Get the directory name properly in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env file
const envPath = path.resolve(__dirname, "../.env")
if (fs.existsSync(envPath)) {
  console.log(`Loading environment variables from ${envPath}`)
  dotenv.config({ path: envPath })
} else {
  console.warn(`No .env file found at ${envPath}`)
  dotenv.config() // Try to load from default location
}

// Verify OpenAI API key is available
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is not set!")
  console.error("Please set it in your .env file or environment variables.")
  console.error("Current environment variables:", Object.keys(process.env))
}

const app = express()
const port = process.env.PORT || 3001

// Configure multer for file uploads
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
})

// Enable CORS with more specific configuration
app.use(
  cors({
    origin: "*", // In production, you should restrict this to your frontend domain
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
)

// Add middleware to log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`)
  console.log("Headers:", req.headers)
  next()
})

// Middleware to ensure all API responses are JSON
app.use("/api", (req, res, next) => {
  res.setHeader("Content-Type", "application/json")
  next()
})

app.use(express.json())

// Serve a simple HTML page at the root
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Book Cover Processor API</title>
      <link rel="icon" href="/favicon.ico" type="image/x-icon">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          line-height: 1.6;
        }
        h1 { color: #2563eb; }
        code {
          background-color: #f1f5f9;
          padding: 0.2rem 0.4rem;
          border-radius: 0.25rem;
          font-family: monospace;
        }
        .endpoint {
          margin-bottom: 2rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.5rem;
          padding: 1rem;
        }
        .method {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-weight: bold;
          margin-right: 0.5rem;
        }
        .get { background-color: #10b981; color: white; }
        .post { background-color: #3b82f6; color: white; }
      </style>
    </head>
    <body>
      <h1>Book Cover Processor API</h1>
      <p>This service processes book cover images and extracts text from the first pages.</p>
      
      <div class="endpoint">
        <h2><span class="method get">GET</span>/health</h2>
        <p>Check if the API is running.</p>
        <p>Example response:</p>
        <pre><code>{
  "status": "ok",
  "timestamp": "2025-03-07T12:34:56.789Z",
  "version": "1.0.0"
}</code></pre>
      </div>
      
      <div class="endpoint">
        <h2><span class="method post">POST</span>/api/process</h2>
        <p>Process a book cover image and extract text from its pages.</p>
        <p>Request: multipart/form-data with an 'image' field containing the book cover image.</p>
        <p>Example response:</p>
        <pre><code>{
  "text": "The extracted text from the book page..."
}</code></pre>
      </div>
      
      <p>Server status: <strong>Running</strong> on port ${port}</p>
      <p>OpenAI API Key: <strong>${process.env.OPENAI_API_KEY ? "Configured ✓" : "Missing ✗"}</strong></p>
    </body>
    </html>
  `)
})

// Serve a favicon
app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/favicon.ico"))
})

// Add a simple health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
    openaiApiConfigured: !!process.env.OPENAI_API_KEY,
  })
})

// Process endpoint - ensure it's at /api/process to match the web service's expectation
app.post("/api/process", upload.single("image"), async (req, res) => {
  try {
    console.log("Received process request")
    console.log("Request body:", req.body)
    console.log(
      "File:",
      req.file
        ? {
            fieldname: req.file.fieldname,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : "No file",
    )

    if (!req.file) {
      return res.status(400).json({ error: "No image provided" })
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OpenAI API key is not configured. Please set the OPENAI_API_KEY environment variable.",
      })
    }

    console.log("Processing image of size:", req.file.size, "bytes")

    const result = await processBookCover(req.file.buffer)
    return res.json(result)
  } catch (error) {
    console.error("Error processing book cover:", error)

    if (error instanceof Error && error.message.includes("not a valid book cover")) {
      return res.status(400).json({
        error: "The image does not appear to be a book cover. Please retake the photo.",
      })
    }

    return res.status(500).json({
      error:
        "An error occurred while processing the image: " + (error instanceof Error ? error.message : "Unknown error"),
    })
  }
})

// Handle 404 errors - must be JSON for API routes, HTML for other routes
app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` })
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>404 - Not Found</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; }
          h1 { color: #e11d48; }
        </style>
      </head>
      <body>
        <h1>404 - Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
        <p><a href="/">Go back to home</a></p>
      </body>
      </html>
    `)
  }
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err)

  if (req.path.startsWith("/api")) {
    res.status(500).json({ error: "Internal server error", message: err.message })
  } else {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>500 - Server Error</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 2rem; }
          h1 { color: #e11d48; }
        </style>
      </head>
      <body>
        <h1>500 - Server Error</h1>
        <p>Something went wrong on our end. Please try again later.</p>
        <p><a href="/">Go back to home</a></p>
      </body>
      </html>
    `)
  }
})

// Start the server
const server = app.listen(port, () => {
  console.log(`Processor service running on port ${port}`)
  console.log(`- Health check: http://localhost:${port}/health`)
  console.log(`- API endpoint: http://localhost:${port}/api/process`)
  console.log(`- Documentation: http://localhost:${port}/`)
  console.log(`- OpenAI API Key: ${process.env.OPENAI_API_KEY ? "Configured ✓" : "Missing ✗"}`)
})

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server")
  server.close(() => {
    console.log("HTTP server closed")
  })
})

