/** @type {import('next').NextConfig} */
const nextConfig = {
    // Ensure API routes are enabled
    experimental: {
      serverComponentsExternalPackages: [],
    },
    // Add any needed rewrites or redirects
    async rewrites() {
      return []
    },
    // Ensure we're not accidentally blocking API routes
    async headers() {
      return []
    },
  }
  
  module.exports = nextConfig
  
  