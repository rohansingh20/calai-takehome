import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import axios from "axios"
import { fetchBookInfo } from "./bookInfoService.js"
import puppeteer from 'puppeteer-core';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

interface Screenshot {
  index: number;
  base64Imagee: string;
}

// Check if OpenAI API key is available
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is not set!")
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

    // Step 4: Extract screenshots using puppeteer
    console.log("Extracting screenshots...")
    const startPage = bookInfo.isFiction ? 2 : 1
    const screenshotResult = await extractBookScreenshots(bookInfo.id, bookInfo.isFiction)
    
    // Step 5: Analyze the screenshots to extract text
    let extractedText = ""
    if (screenshotResult.success && screenshotResult.screenshots.length > 0) {
      console.log("Analyzing screenshots to extract text...")
      extractedText = await analyzeScreenshots(screenshotResult.screenshots, bookInfo)
    }

    // Create a clean result with just the required information
    console.log("Processing complete, returning result")
    return { 
      text: extractedText || createFallbackPreviewMessage(bookInfo),
      url: `https://books.google.com/books?id=${bookInfo.id}&newbks=0&lpg=PP1&pg=PA${startPage}&output=embed`,
      bookInfo: {
        ...bookInfo,
        pageType: bookInfo.isFiction ? "second" : "first"
      },
      capturedScreenshots: screenshotResult.screenshots.length
    }
  } catch (error) {
    console.error("Error in processBookCover:", error)
    throw error
  }
}

async function validateBookCover(imageBuffer) {
  try {
    // Ensure we have a valid base64 string with proper formatting for OpenAI API
    const base64Image = imageBuffer.toString("base64")

    console.log("Calling OpenAI API to validate book cover...")
    console.log("OpenAI API Key available:", !!process.env.OPENAI_API_KEY)

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
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
    // Ensure we have a valid base64 string with proper formatting for OpenAI API
    const base64Image = imageBuffer.toString("base64")

    // Use GPT-4 Vision to extract book details from the cover
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
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

async function analyzeScreenshots(screenshots, bookInfo) {
  try {
    console.log(`Analyzing ${screenshots.length} screenshots to extract text...`)
    
    let combinedText = ""
    
    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i]
      console.log(`Analyzing screenshot ${i + 1}/${screenshots.length}...`)
      
      try {
        const base64Image = `data:image/jpeg;base64,${screenshot.base64Imagee}`;
        
        // Use GPT-4o to extract text from the screenshot
        const { text } = await generateText({
          model: openai("gpt-4o-mini"),
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Extract all the text from this book page image, maintaining paragraph structure. Only return the text content exactly as it appears, with no additional commentary.",
                },
                {
                  type: "image",
                  image: base64Image,
                },
              ],
            },
          ],
        })
         
        // Add the extracted text to our combined text
        combinedText += `\n--- Screenshot ${i + 1} ---\n\n${text.trim()}\n\n`
      } catch (error) {
        console.error(`Error analyzing screenshot ${i + 1}:`, error)
      }
    }
    
    if (combinedText.trim()) {
      return `# ${bookInfo.title} by ${bookInfo.author}\n\n${combinedText}`
    } else {
      return ""
    }
  } catch (error) {
    console.error("Error analyzing screenshots:", error)
    return ""
  }
}


async function isFirstPage(screenshot) {
  try {
    try {
      const base64Image = `data:image/jpeg;base64,${screenshot}`;
      let isFirst = false;
      
      // Use GPT-4o to extract text from the screenshot
      const { text } = await generateText({
        model: openai("gpt-4o-mini"),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Check if this is the first page of actual reading content in the book (excluding title, table of contents, etc.). Only return 'yes' or 'no' with no additional commentary.",
              },
              {
                type: "image",
                image: base64Image,
              },
            ],
          },
        ],
      })

      console.log("First page detection result:", text.trim()) 
      if (text.trim().toLowerCase().includes("yes")) {
        isFirst = true
      }

      return isFirst;
       
      
    } catch (error) {
      console.error(`Error analyzing screenshot:`, error)
    }
  } catch (error) {
    console.error("Error analyzing screenshots:", error)
  }
}

function createFallbackPreviewMessage(bookInfo) {
  const pageType = bookInfo.isFiction ? "second" : "first"
  
  let message = `# ${bookInfo.title} by ${bookInfo.author}\n\n`
  
  if (bookInfo.description) {
    message += `## Description\n\n${bookInfo.description}\n\n`
  }
  
  message += `We were unable to access or extract text from the ${pageType} page for this book.\n\n`
  
  if (bookInfo.previewLink) {
    message += `You can [view the book preview on Google Books](${bookInfo.previewLink}) to read sample pages.\n\n`
  }
  
  return message
}

export async function extractBookScreenshots(bookId, bookIsFiction) {
  console.log(`Starting screenshot extraction for book ID: ${bookId} from page ${1}`);
  
  let browser;
  const screenshots = [];
  
  try {
    // Determine environment (production or development)
    const isProd = process.env.NODE_ENV === 'production';
    let browserConfig = {};

    if (isProd) {
      console.log("Running in production environment (Vercel)");
      try {
        // For Vercel/serverless environment
        const chromium = await import('chrome-aws-lambda');
        browserConfig = {
          args: [...chromium.args, '--disable-web-security'],
          executablePath: await chromium.executablePath,
          headless: chromium.headless,
        };
        console.log("Using chrome-aws-lambda with executable path:", browserConfig.executablePath);
      } catch (error) {
        console.error("Error importing chrome-aws-lambda:", error);
        console.log("Falling back to default browser launch options");
        browserConfig = {
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
          headless: 'new'
        };
      }
    } else {
      console.log("Running in development environment");
      
      // Try to locate Chrome/browser executable
      try {
        const executablePath = await getChromePath();
        console.log(`Using Chrome at: ${executablePath}`);
        browserConfig = {
          headless: 'new',
          executablePath,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
        };
      } catch (error) {
        console.warn("Chrome executable path not found:", error.message);
        console.log("Falling back to puppeteer's bundled Chromium");
        
        // Try using puppeteer's bundled Chrome
        try {
          const puppeteerFull = await import('puppeteer');
          browser = await puppeteerFull.default.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
          });
        } catch (puppeteerError) {
          console.error("Error launching puppeteer's bundled Chromium:", puppeteerError);
          
          // Last resort - try launching without specifying executable path
          browserConfig = {
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
          };
        }
      }
    }

    if (!browser) {
      browser = await puppeteer.launch(browserConfig);
    }

   
    const screenshots: Screenshot[] = [];
    const page = await browser.newPage();
    let foundfirst = false;

    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36');

    // Navigate to Google Books URL
    const url = `https://books.google.com/books?id=${bookId}&newbks=0&lpg=PP1&pg=PA1&output=embed`;
    console.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Page loaded');

    // Wait for iframe and locate the one with the next page button
    // console.log('Page content:', html);

    const buttonHandle = await page.waitForFunction(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      return divs.find(div => div.style.backgroundImage.includes('right_btn.png'));
    }, {timeout: 60000 });

    const buttonSelector = 'div[style*="background-image: url(\'https://www.google.com/googlebooks/images/right_btn.png\')"]';


    // Capture 5 screenshots
    for (let i = 1; i <= 15; i++) {
      console.log(`Taking screenshot ${i + 1}/5`);

      const screenshotBuffer = await page.screenshot({
        type: 'jpeg',
        quality: 80,
        fullPage: false // Capture viewport only
      });
 
      const buffer = Buffer.from(screenshotBuffer);
      const base64Screenshot = buffer.toString('base64');
    

      console.log("base64Screenshot: ", base64Screenshot.substring(0, 20));

      foundfirst = await isFirstPage(base64Screenshot) ?? false;
      console.log("foundfirst at EoL: ", foundfirst);


      if (!foundfirst) {
        try {
          if (buttonHandle) {
            await buttonHandle.click();
            console.log('Clicked buttonHandle next page button');
          } else {
            await page.click(buttonSelector);
            console.log('Clicked page.click next page button');
          }
        } catch (error) {
          console.log('Could not click next page button, possibly end of preview');
        }

      } else if (base64Screenshot && base64Screenshot.length > 0) {
        console.log("Found first page!")

        if (bookIsFiction) {
          try {
            if (buttonHandle) {
              await buttonHandle.click();
              console.log('Clicked buttonHandle next page button');
            } else {
              await page.click(buttonSelector);
              console.log('Clicked page.click next page button');
            }
          } catch (error) {
            console.log('Could not click next page button, possibly end of preview');
          }

        }

        console.log(`Screenshot ${i + 1} base64 length: ${base64Screenshot.length}`);
        screenshots.push({
          index: i,
          base64Imagee: base64Screenshot
        });

        // Save to disk for debugging
        const debugDir = path.join(os.tmpdir(), 'book-screenshots');
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const screenshotPath = path.join(debugDir, `screenshot-${bookId}-${i + 1}.jpg`);
        fs.writeFileSync(screenshotPath, screenshotBuffer);
        console.log(`Saved screenshot: ${screenshotPath}`);

        break;

      } else {
        console.log(`Screenshot ${i + 1} is empty or invalid`);
      }

    }

    console.log(`Screenshot capture complete. Captured ${screenshots.length} screenshots.`);

    return {
      success: screenshots.length > 0,
      screenshots,
      message: `Successfully captured ${screenshots.length} screenshots`
    };

  } catch (error) {
    console.error("Error in extractBookScreenshots:", error);
    return {
      success: false,
      screenshots,
      message: "Error extracting screenshots: " + (error instanceof Error ? error.message : "Unknown error")
    };
  } finally {
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }
  }
}

/**
 * Finds Chrome/Chromium executable path
 * @returns Path to Chrome executable
 */
async function getChromePath() {
  const platform = os.platform();
  console.log(`Detecting Chrome on platform: ${platform}`);
  
  // Define common Chrome paths by platform
  const chromePaths = {
    darwin: [  // macOS
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Opera.app/Contents/MacOS/Opera'
    ],
    win32: [  // Windows
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
    ],
    linux: [  // Linux
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser'
    ]
  };
  
  // Get list of paths to try for the current platform
  const pathsToTry = chromePaths[platform] || [];
  
  // Try each path
  for (const chromePath of pathsToTry) {
    try {
      if (fs.existsSync(chromePath)) {
        console.log(`Found browser at: ${chromePath}`);
        return chromePath;
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  // Try using 'which' command on Linux/macOS
  if (platform !== 'win32') {
    try {
      const { exec } = await import('child_process');
      const util = await import('util');
      const execAsync = util.promisify(exec);
      
      // Try to find Chrome/Chromium using which
      const browsers = ['google-chrome', 'chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave'];
      
      for (const browser of browsers) {
        try {
          const { stdout } = await execAsync(`which ${browser}`);
          if (stdout.trim()) {
            console.log(`Found browser with 'which' command: ${stdout.trim()}`);
            return stdout.trim();
          }
        } catch (e) {
          // Ignore errors from which command
        }
      }
    } catch (error) {
      // Continue to next method
    }
  }
  
  // If we reach here, we couldn't find Chrome
  throw new Error(`Could not find Chrome/Chromium browser on platform ${platform}. Please install Chrome or specify its path manually.`);
}
