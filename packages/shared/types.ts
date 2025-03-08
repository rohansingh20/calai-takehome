export interface BookInfo {
  title: string
  author: string
  isFiction: boolean
  isbn: string | null
  description: string | null
}

export interface ProcessResult {
  text: string
}

export interface ErrorResponse {
  error: string
}

