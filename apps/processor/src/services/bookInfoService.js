import axios from "axios"

export function improvedFictionDetection(categories, description, title) {
  // First check categories using the existing method
  const categoryResult = isFictionCategory(categories);
  
  // If we have a clear signal from categories, use that
  if (categories && categories.length > 0) {
    return categoryResult;
  }
  
  // If no clear signal from categories, analyze description and title
  let fictionSignals = 0;
  let nonfictionSignals = 0;
  
  // Check description for signals if available
  if (description) {
    const desc = description.toLowerCase();
    
    // Fiction signals in description
    const fictionWords = [
      "novel", "fiction", "story", "adventure", "fantasy", 
      "protagonist", "character", "hero", "magical", "romance",
      "thriller", "mystery", "sci-fi", "science fiction", "dystopian",
      "journey", "tale", "legend", "epic", "saga"
    ];
    
    // Non-fiction signals in description
    const nonfictionWords = [
      "history", "guide", "analysis", "research", "biography", 
      "autobiography", "memoir", "reference", "textbook", "examination",
      "study", "report", "handbook", "manual", "investigation",
      "philosophy", "theory", "argument", "thesis", "exploration",
      "account", "chronicle", "journal", "essay", "documentary"
    ];
    
    // Count signals
    fictionWords.forEach(word => {
      if (desc.includes(word)) fictionSignals++;
    });
    
    nonfictionWords.forEach(word => {
      if (desc.includes(word)) nonfictionSignals++;
    });
  }
  
  // Check title for signals
  if (title) {
    const lowTitle = title.toLowerCase();
    
    // Look for non-fiction title patterns
    if (/^(how to|the art of|introduction to|guide to|principles of|history of|the science of)/i.test(lowTitle)) {
      nonfictionSignals += 2;
    }
    
    // Title length can be a weak signal (fiction titles tend to be shorter)
    if (title.split(" ").length <= 3) {
      fictionSignals += 0.5;
    }
  }
  
  // Make decision based on signals
  if (fictionSignals > nonfictionSignals) {
    return true;
  } else if (nonfictionSignals > fictionSignals) {
    return false;
  } else {
    // Default to fiction if we still can't tell
    return true;
  }
}

// Update the fetchBookInfo function to use our improved fiction detection
export async function fetchBookInfo(bookDetails) {
  try {
    console.log("Fetching book info for:", bookDetails)
    
    // If we have an ISBN, use that for most accurate results
    if (bookDetails.isbn) {
      try {
        return await fetchBookByISBN(bookDetails.isbn)
      } catch (error) {
        console.log("ISBN search failed, falling back to title/author search")
      }
    }
    
    // If no ISBN or ISBN search failed, use title and author
    if (bookDetails.title) {
      let searchQuery = bookDetails.title
      if (bookDetails.author && bookDetails.author !== "Unknown") {
        searchQuery += ` ${bookDetails.author}`
      }
      
      const bookInfo = await searchBookAPI(searchQuery)
      
      // Use our improved fiction detection
      if (bookInfo) {
        bookInfo.isFiction = improvedFictionDetection(
          bookInfo.categories || [], 
          bookInfo.description || "", 
          bookInfo.title || ""
        );
      }
      
      return bookInfo
    }
    
    throw new Error("Insufficient information to search for book")
  } catch (error) {
    console.error("Error in fetchBookInfo:", error)
    
    // If all API calls fail, return the original details with defaults
    return {
      title: bookDetails.title || "Unknown Title",
      author: bookDetails.author || "Unknown Author",
      isFiction: bookDetails.isFiction !== undefined ? bookDetails.isFiction : true,
      isbn: bookDetails.isbn || null,
      description: null,
      previewLink: null,
      id: null
    }
  }
}

export async function fetchBookByISBN(isbn) {
  try {
    const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`)
    const data = response.data

    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo

      return {
        title: book.title,
        author: book.authors ? book.authors[0] : "Unknown",
        isFiction: isFictionCategory(book.categories),
        isbn: isbn,
        description: book.description || null,
        previewLink: book.previewLink || null,
        // Add these fields for preview extraction
        id: data.items[0].id,
        accessInfo: data.items[0].accessInfo || {}
      }
    }

    throw new Error("Book not found with ISBN: " + isbn)
  } catch (error) {
    console.error("Error in Google Books API call:", error)
    throw error
  }
}

/**
 * Searches for book information using a general query
 * @param {string} query - Search query (title, author, etc.)
 * @returns {Object} - Book information
 */
export async function searchBookAPI(query) {
  try {
    const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}`)
    const data = response.data

    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo

      return {
        title: book.title,
        author: book.authors ? book.authors[0] : "Unknown",
        isFiction: isFictionCategory(book.categories),
        isbn: book.industryIdentifiers
          ? book.industryIdentifiers.find((id) => id.type === "ISBN_13")?.identifier ||
            book.industryIdentifiers.find((id) => id.type === "ISBN_10")?.identifier ||
            null
          : null,
        description: book.description || null,
        previewLink: book.previewLink || null,
        // Add these fields for preview extraction
        id: data.items[0].id,
        accessInfo: data.items[0].accessInfo || {}
      }
    }

    throw new Error("Book not found with query: " + query)
  } catch (error) {
    console.error("Error in Google Books API search:", error)
    throw error
  }
}

export function isFictionCategory(categories) {
  if (!categories || categories.length === 0) {
    return true // Default to fiction if no categories
  }

  const nonFictionKeywords = [
    "biography",
    "history",
    "science",
    "technology",
    "business",
    "self-help",
    "cooking",
    "travel",
    "reference",
    "education",
    "philosophy",
    "religion",
    "politics",
    "economics",
    "medicine",
    "law",
    "mathematics",
    "computers",
    "nature",
    "art history",
  ]

  // Check if any category contains non-fiction keywords
  for (const category of categories) {
    const lowerCategory = category.toLowerCase()
    if (nonFictionKeywords.some((keyword) => lowerCategory.includes(keyword))) {
      return false
    }

    // Explicit check for "non-fiction" or "nonfiction"
    if (lowerCategory.includes("non-fiction") || lowerCategory.includes("nonfiction")) {
      return false
    }
  }

  return true
}