/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // better-sqlite3 is a native addon; keep it external to the server bundle.
  serverExternalPackages: ['better-sqlite3'],
}

module.exports = nextConfig
