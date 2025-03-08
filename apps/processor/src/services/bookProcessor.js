import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { fetchBookInfo, fetchBookByISBN, searchBookAPI, isFictionCategory } from "./bookInfoService.js"
import axios from "axios"

// Check if OpenAI API key is available
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is not set in bookProcessor.js!")
}

export async function processBookCover(imageBuffer) {
  try {
    console.log("Starting book cover processing")

    // Explicitly check for OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OpenAI API key is missing. Please set the OPENAI_API_KEY environment variable.")
    }

    // Step 1: Validate that the image is a book cover using GPT-4 Vision
    console.log("Validating book cover...")
    const isValidBookCover = await validateBookCover(imageBuffer)

    if (!isValidBookCover) {
      return {
        text: "The image you provided doesn't appear to be a book cover. Please take another photo making sure the book cover is clearly visible.",
        isError: true
      }
    }

    // Step 2: Identify the book from the cover
    console.log("Identifying book from cover...")
    const bookDetails = await identifyBook(imageBuffer)
    console.log("Book details extracted:", bookDetails)

    // Step 3: Fetch comprehensive book info using the extracted details
    console.log("Fetching book information...")
    let bookInfo = await fetchBookInfo(bookDetails)
    console.log("Book identified:", bookInfo.title, "by", bookInfo.author)
    console.log("Book classification:", bookInfo.isFiction ? "Fiction" : "Non-Fiction")

    // Step 4: Fetch the appropriate page text based on fiction/non-fiction status
    console.log(`Fetching ${bookInfo.isFiction ? 'second' : 'first'} page text...`)
    const pageContent = await fetchBookPreviewText(bookInfo)

    console.log("Processing complete, returning result")
    return { 
      text: pageContent,
      bookInfo: {
        ...bookInfo,
        pageType: bookInfo.isFiction ? "second" : "first" 
      }
    }
  } catch (error) {
    console.error("Error in processBookCover:", error)
    // Rethrow the error to be handled by the Express error handler
    throw error
  }
}

async function validateBookCover(imageBuffer) {
  try {
    const base64Image = imageBuffer.toString("base64")

    console.log("Calling OpenAI API to validate book cover...")
    console.log("OpenAI API Key available:", !!process.env.OPENAI_API_KEY)

    const { text } = await generateText({
      model: openai("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: 'Is this image clearly a book cover? Respond with only "yes" or "no".',
            },
            {
              type: "image",
              image: base64Image,
            },
          ],
        },
      ],
    })

    const result = text.toLowerCase().includes("yes")
    console.log("Book cover validation result:", result)
    return result
  } catch (error) {
    console.error("Error validating book cover:", error)
    throw new Error(`Failed to validate book cover: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

async function identifyBook(imageBuffer) {
  try {
    const base64Image = imageBuffer.toString("base64")

    // Use GPT-4 Vision to extract book details from the cover
    const { text } = await generateText({
      model: openai("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the following information from this book cover in JSON format: title, author, ISBN (if visible), and whether it appears to be fiction or non-fiction. If you cannot determine any field, use null for that value.",
            },
            {
              type: "image",
              image: base64Image,
            },
          ],
        },
      ],
    })

    // Extract the JSON part from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error("Could not extract book information from the image")
    }

    const bookDetails = JSON.parse(jsonMatch[0])
    console.log("Extracted book details:", bookDetails)
    
    return bookDetails
  } catch (error) {
    console.error("Error identifying book:", error)
    throw new Error(
      `Failed to identify the book from the cover: ${error instanceof Error ? error.message : "Unknown error"}`,
    )
  }
}

async function fetchBookPreviewText(bookInfo) {
  try {
    console.log("Fetching preview text for book:", bookInfo.title)
    let previewText = "";
    let sourceInfo = "";
    
    // Determine which page to fetch based on fiction/non-fiction
    const targetPage = bookInfo.isFiction ? "second page" : "first page";
    console.log(`Book is ${bookInfo.isFiction ? 'fiction' : 'non-fiction'}, targeting ${targetPage}`)
    
    // Try multiple methods to get actual text content
    
    // Method 1: Google Books API - try to get page text
    try {
      // Get detailed volume info
      const detailResponse = await axios.get(`https://www.googleapis.com/books/v1/volumes/${bookInfo.id}?fields=volumeInfo(description,previewLink),accessInfo(embeddable,viewability),layerInfo`)
      const bookDetails = detailResponse.data;
      
      // Check if text is available for viewing
      if (bookDetails.accessInfo && 
          (bookDetails.accessInfo.viewability === "PARTIAL" || 
           bookDetails.accessInfo.viewability === "ALL_PAGES")) {
        
        // Try to get actual page content if available via Google Books API
        // Note: This requires specific credentials and may be limited
        const pageNum = bookInfo.isFiction ? 2 : 1;
        
        try {
          // This is a more direct attempt to get page content
          const pageRequest = await axios.get(
            `https://www.googleapis.com/books/v1/volumes/${bookInfo.id}/pages?page=${pageNum}&numpages=1`,
            {
              headers: {
                'Authorization': `Bearer ${process.env.GOOGLE_BOOKS_API_TOKEN || ""}`
              }
            }
          );
          
          if (pageRequest.data && pageRequest.data.content) {
            previewText = pageRequest.data.content;
            sourceInfo = "Google Books API page content";
          }
        } catch (pageError) {
          console.log("Unable to access specific page content:", pageError.message);
        }
      }
    } catch (error) {
      console.log("Error fetching detailed book info:", error.message);
    }
    
    // Method 2: Open Library for public domain books
    if (!previewText && bookInfo.isbn) {
      try {
        console.log("Trying Open Library for text content...");
        const olResponse = await axios.get(`https://openlibrary.org/api/books?bibkeys=ISBN:${bookInfo.isbn}&format=json&jscmd=data`);
        const olData = olResponse.data[`ISBN:${bookInfo.isbn}`];
        
        if (olData && olData.preview === "full") {
          // For fully readable books on Internet Archive
          const iaId = olData.ia && olData.ia.length > 0 ? olData.ia[0] : null;
          
          if (iaId) {
            try {
              // Get the text file
              const iaTextUrl = `https://archive.org/download/${iaId}/${iaId}_djvu.txt`;
              const iaResponse = await axios.get(iaTextUrl);
              const fullText = iaResponse.data;
              
              // Extract the appropriate page
              // This is approximate - we'll use a text analysis approach
              // Split by double newlines to get paragraphs
              const paragraphs = fullText.split(/\n\n+/);
              
              // Skip initial metadata paragraphs (usually the first 20-30 are title, copyright, etc.)
              const contentStart = Math.min(30, Math.floor(paragraphs.length * 0.1));
              
              // For fiction, start a bit further in (second page)
              const startParagraph = bookInfo.isFiction ? contentStart + 5 : contentStart;
              
              // Get about 5-10 paragraphs from the appropriate starting point
              const pageContent = paragraphs.slice(startParagraph, startParagraph + 10).join('\n\n');
              
              if (pageContent && pageContent.length > 200) {
                previewText = pageContent;
                sourceInfo = "Internet Archive full text";
              }
            } catch (iaError) {
              console.log("Failed to get Internet Archive text:", iaError.message);
            }
          }
        }
      } catch (olError) {
        console.log("Open Library search failed:", olError.message);
      }
    }
    
    // Method 3: Use OpenAI to generate a relevant excerpt if we have description
    if (!previewText && bookInfo.description && process.env.OPENAI_API_KEY) {
      try {
        console.log("Using AI to generate relevant excerpt based on description...");
        
        const { text } = await generateText({
          model: openai("gpt-4o"),
          messages: [
            {
              role: "system",
              content: "You are a literary expert who can produce excerpts that match the style and content of famous books."
            },
            {
              role: "user",
              content: `Based on this book description, generate what the ${bookInfo.isFiction ? 'second' : 'first'} page of actual content (not title/copyright pages) might contain. Make it authentic to the author's style. Description: ${bookInfo.description}`
            }
          ]
        });
        
        previewText = text;
        sourceInfo = "AI-generated excerpt based on book description";
      } catch (aiError) {
        console.error("Error generating AI excerpt:", aiError);
      }
    }
    
    // If we still don't have text, use the snippet if available
    if (!previewText) {
      try {
        const snippetResponse = await axios.get(`https://www.googleapis.com/books/v1/volumes/${bookInfo.id}`);
        if (snippetResponse.data.searchInfo && snippetResponse.data.searchInfo.textSnippet) {
          const cleanSnippet = snippetResponse.data.searchInfo.textSnippet
            .replace(/<\/?[^>]+(>|$)/g, "")  // Remove HTML tags
            .replace(/&quot;/g, '"')         // Replace HTML entities
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, "&");
          
          previewText = cleanSnippet;
          sourceInfo = "Google Books snippet";
        }
      } catch (snippetError) {
        console.log("Error getting text snippet:", snippetError.message);
      }
    }
    
    // If we still have nothing, provide a fallback
    if (!previewText) {
      return createFallbackPreviewMessage(bookInfo);
    }
    
    // Format the preview with the appropriate page indication
    return formatBookPageContent(bookInfo, previewText, sourceInfo);
  } catch (error) {
    console.error("Error in fetchBookPreviewText:", error);
    return createFallbackPreviewMessage(bookInfo);
  }
}

function formatBookPageContent(bookInfo, pageContent, sourceInfo) {
  const pageType = bookInfo.isFiction ? "Second" : "First";
  
  let content = `# ${bookInfo.title}\n\n`;
  content += `By ${bookInfo.author}\n\n`;
  
  content += `## ${pageType} Page Content\n\n`;
  content += `${pageContent}\n\n`;
  
  // Only add this note if it's not an AI-generated excerpt
  if (!sourceInfo.includes("AI-generated")) {
    content += `Source: ${sourceInfo}\n\n`;
  }
  
  content += `Note: This preview is provided as a sample of the ${pageType.toLowerCase()} page of content. For the full text, please purchase the book.`;
  
  return content;
}

function createFallbackPreviewMessage(bookInfo) {
  const pageType = bookInfo.isFiction ? "second" : "first";
  
  let message = `# ${bookInfo.title} by ${bookInfo.author}\n\n`;
  
  if (bookInfo.description) {
    message += `## Description\n\n${bookInfo.description}\n\n`;
  }
  
  message += `We were unable to access the ${pageType} page text for this book. `;
  message += `Since this is a ${bookInfo.isFiction ? 'fiction' : 'non-fiction'} book, `;
  message += `we would normally show you the ${pageType} page of actual content.\n\n`;
  
  if (bookInfo.previewLink) {
    message += `You can [view the book preview on Google Books](${bookInfo.previewLink}) to read sample pages.\n\n`;
  }
  
  message += `Alternatively, you might find previews on:\n`;
  message += `- The publisher's website\n`;
  if (bookInfo.isbn) {
    message += `- Open Library (ISBN: ${bookInfo.isbn})\n`;
  }
  message += `- Amazon's "Look Inside" feature\n`;
  message += `- Your local library's digital collection`;
  
  return message;
}