"use client"

import React, { useState, useEffect } from "react"
import { Upload, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AnimatePresence, motion } from "framer-motion"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [processorStatus, setProcessorStatus] = useState<"checking" | "online" | "offline">("checking")
  const [apiUrl, setApiUrl] = useState<string>("")

  useEffect(() => {
    const checkProcessorStatus = async () => {
      try {
        const processorUrl = "http://localhost:3001/health"
        const response = await fetch(processorUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`)
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
      reader.onload = (e) => setPreview(e.target?.result as string)
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
      const processorUrl = "http://localhost:3001/api/process"
      const response = await fetch(processorUrl, { method: "POST", body: formData })
      const contentType = response.headers.get("content-type")

      if (!contentType?.includes("application/json")) {
        const text = await response.text()
        throw new Error(`Invalid response (${response.status}): ${text}`)
      }

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || `Failed to process image (${response.status})`)

      setResult(data.text)
      setUrl(data.url)
    } catch (err) {
      console.error("Error:", err)
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 p-6 md:p-12">
      <div className="w-full max-w-6xl mx-auto space-y-12">
        {/* Title Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Book Page Extractor</h1>
          <p className="text-lg text-gray-600">Upload a book cover image to extract text from its first pages</p>
        </div>

        {/* Side-by-Side Layout */}
        <div className="flex flex-col md:flex-row space-y-8 md:space-y-0 md:space-x-8">
          {/* Left Side: Smaller Upload Section */}
          <div className="left-side w-full md:w-1/3 space-y-8">
            {/* Service Status Alert */}
            <AnimatePresence>
              {processorStatus !== "online" && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Alert variant="destructive" className="rounded-lg shadow-sm">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-sm font-medium">Service Status</AlertTitle>
                    <AlertDescription className="text-sm">
                      {processorStatus === "checking"
                        ? "Checking processor service status..."
                        : "The processor service is offline. Some features may not work."}
                      {apiUrl && <div className="mt-2 text-xs text-gray-500">Processor URL: {apiUrl}</div>}
                    </AlertDescription>
                  </Alert>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload Form */}
            <Card className="p-6 bg-white shadow-md rounded-xl">
              <form onSubmit={handleSubmit} className="space-y-6">
                <label htmlFor="image-upload" className="cursor-pointer group">
                  <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center transition-all group-hover:border-blue-500 group-hover:bg-blue-50">
                    <AnimatePresence>
                      {!preview && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <motion.div
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Upload className="h-12 w-12 text-gray-400" />
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {preview && (
                      <motion.img
                        src={preview}
                        alt="Book cover preview"
                        className="max-h-24 object-contain rounded-md shadow-sm"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                    <p className="mt-4 text-sm text-gray-500">
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

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm"
                    disabled={!file || loading || processorStatus !== "online"}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Extract Text"
                    )}
                  </Button>
                </motion.div>
              </form>
            </Card>

            {/* Error Section */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="p-4 bg-white shadow-md rounded-xl border-l-4 border-red-500">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
                      <div>
                        <h3 className="font-medium text-red-500">Error</h3>
                        <p className="text-sm text-gray-700">{error}</p>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Side: Text Extraction and Book Preview */}
          <div className="right-side w-full md:w-2/3 space-y-8">
            <AnimatePresence>
              {result && (
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ duration: 0.5 }}
                >
                  <Card className="p-6 bg-white shadow-md rounded-xl w-full">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Extracted Text</h2>
                    <Textarea
                      value={result}
                      readOnly
                      className="h-[200px] resize-none border-none bg-gray-100 p-4 rounded-md text-gray-700"
                    />
                  </Card>
                </motion.div>
              )}
              {url && (
                <motion.div
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 50 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  <Card className="p-6 bg-white shadow-md rounded-xl w-full">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Book Preview</h2>
                    <iframe
                      className="w-full h-[500px] rounded-md"
                      src={url}
                      title="Book Preview"
                    />
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </main>
  )
}









// "use client"

// import type React from "react"

// import { useState, useEffect } from "react"
// import { Upload, Loader2, AlertCircle } from "lucide-react"
// import { Button } from "@/components/ui/button"
// import { Card } from "@/components/ui/card"
// import { Textarea } from "@/components/ui/textarea"
// import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// export default function Home() {
//   const [file, setFile] = useState<File | null>(null)
//   const [status, setStatus] = useState<string | null>(null)
//   const [preview, setPreview] = useState<string | null>(null)
//   const [result, setResult] = useState<string | null>(null)
//   const [url, setUrl] = useState<string | null>(null)
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState<string | null>(null)
//   const [processorStatus, setProcessorStatus] = useState<"checking" | "online" | "offline">("checking")
//   const [apiUrl, setApiUrl] = useState<string>("")

//   // Check if the processor service is available on component mount
//   useEffect(() => {
//     const checkProcessorStatus = async () => {
//       try {
//         // Try to check processor status directly without relying on our API endpoints
//         const processorUrl = "http://localhost:3001/health"
//         console.log(`Checking processor health directly at: ${processorUrl}`)

//         const response = await fetch(processorUrl, {
//           method: "GET",
//           headers: {
//             Accept: "application/json",
//           },
//           // Short timeout to avoid long waits
//           signal: AbortSignal.timeout(5000),
//         })

//         if (!response.ok) {
//           throw new Error(`Health check failed with status: ${response.status}`)
//         }

//         const data = await response.json()
//         setProcessorStatus("online")
//         setApiUrl("http://localhost:3001/api/process")
//       } catch (err) {
//         console.error("Processor status check failed:", err)
//         setProcessorStatus("offline")
//       }
//     }

//     checkProcessorStatus()
//   }, [])

//   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const selectedFile = e.target.files?.[0]
//     if (selectedFile) {
//       setFile(selectedFile)
//       const reader = new FileReader()
//       reader.onload = (e) => {
//         setPreview(e.target?.result as string)
//       }
//       reader.readAsDataURL(selectedFile)
//       setResult(null)
//       setError(null)
//     }
//   }

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault()
//     if (!file) return

//     setLoading(true)
//     setError(null)

//     try {
//       const formData = new FormData()
//       formData.append("image", file)

//       // Send the request directly to the processor service instead of through the Next.js API
//       const processorUrl = "http://localhost:3001/api/process"
//       console.log(`Sending request directly to processor service at: ${processorUrl}`)

//       const response = await fetch(processorUrl, {
//         method: "POST",
//         body: formData,
//       })

//       // Log the full response for debugging
//       console.log("Response status:", response.status)
//       console.log("Response headers:", Object.fromEntries([...response.headers.entries()]))

//       // Check if the response is JSON
//       const contentType = response.headers.get("content-type")
//       console.log("Content-Type:", contentType)

//       if (!contentType || !contentType.includes("application/json")) {
//         const textResponse = await response.text()
//         console.error("Non-JSON response received:", textResponse)
//         throw new Error(`The server returned an invalid response (${response.status}). Please check server logs.`)
//       }

//       const data = await response.json()

//       if (!response.ok) {
//         throw new Error(data.error || `Failed to process image (${response.status})`)
//       }

//       setResult(data.text)
//       setUrl(data.url)
//       console.log("setUrl: ", data)
//     } catch (err) {
//       console.error("Error in handleSubmit:", err)
//       setError(err instanceof Error ? err.message : "An unknown error occurred")
//     } finally {
//       setLoading(false)
//     }
//   }


//   //
//   //https://books.google.com/books/publisher/content?id=Coi9AwAAQBAJ&pg=PA1&img=1&zoom=3&hl=en&sig=ACfU3U2LooOrOLU7B4pjbtwZ_gPsnf0nvw&w=1280


//   return (
//     <>

// <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-24">
//       <div className="w-full max-w-3xl mx-auto space-y-8">
//         <div className="text-center">
//           <h1 className="text-3xl font-bold tracking-tight">Book Page Extractor</h1>
//           <p className="text-muted-foreground mt-2">Upload a book cover image to extract text from its first pages</p>


//         </div>

//         {processorStatus !== "online" && (
//           <Alert variant="destructive">
//             <AlertCircle className="h-4 w-4" />
//             <AlertTitle>Service Status</AlertTitle>
//             <AlertDescription>
//               {processorStatus === "checking"
//                 ? "Checking processor service status..."
//                 : "The processor service is currently offline. Some features may not work correctly."}
//               {apiUrl && <div className="mt-2 text-xs">Configured processor URL: {apiUrl}</div>}
//             </AlertDescription>
//           </Alert>
//         )}

//         <Card className="p-6">
//           <form onSubmit={handleSubmit} className="space-y-6">
//             <div className="grid w-full items-center gap-4">
//               <div className="flex flex-col space-y-2">
//                 <label htmlFor="image-upload" className="cursor-pointer">
//                   <div className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center">
//                     {preview ? (
//                       <img
//                         src={preview || "/placeholder.svg"}
//                         alt="Book cover preview"
//                         className="max-h-32 object-contain mb-4"
//                       />
//                     ) : (
//                       <Upload className="h-12 w-12 text-muted-foreground mb-4" />
//                     )}
//                     <p className="text-sm text-muted-foreground">
//                       {preview ? "Click to change image" : "Upload a book cover image"}
//                     </p>
//                   </div>
//                   <input
//                     id="image-upload"
//                     type="file"
//                     accept="image/*"
//                     className="hidden"
//                     onChange={handleFileChange}
//                   />
//                 </label>
//               </div>
//             </div>

//             <Button type="submit" className="w-full" disabled={!file || loading || processorStatus !== "online"}>
//               {loading ? (
//                 <>
//                   <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                   Processing...
//                 </>
//               ) : (
//                 "Extract Text"
//               )}
//             </Button>
//           </form>
//         </Card>

//         {error && (
//           <Card className="p-6 border-destructive">
//             <div className="flex items-start">
//               <AlertCircle className="h-5 w-5 text-destructive mr-2 mt-0.5" />
//               <div>
//                 <h3 className="font-medium text-destructive">Error</h3>
//                 <p className="text-destructive">{error}</p>
//               </div>
//             </div>
//           </Card>
//         )}

//         {result && (
//           <Card className="p-6">
//             <h2 className="text-xl font-semibold mb-4">Extracted Text</h2>
//             <Textarea value={result} readOnly className="h-[20000px]" />
//           </Card>
//         )}
//       </div>
//     </main>
//      <div className="flex space-x-4">
//           <iframe style={{height: "1000px"}} className="w-full" src={url?.toString()}></iframe>
//           {/* <iframe style={{height: "1000px"}} className="w-full" src="https://books.google.com/books?id=Coi9AwAAQBAJ&newbks=0&lpg=PP1&pg=PP1&output=embed"></iframe> */}
//           {/* <iframe style={{height: "1000px"}} className="w-full h-full" src="https://books.google.com/books?id=Coi9AwAAQBAJ&newbks=0&lpg=PP1&pg=PA2&output=embed"></iframe> */}
//       </div>
    
//     </>
//   )
// }

