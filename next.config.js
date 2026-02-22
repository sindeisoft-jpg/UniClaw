/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['localhost', 'openclaw.ai'],
  },
  env: {
    OPENCLAW_API_URL: process.env.OPENCLAW_API_URL || 'http://localhost:18789',
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.OPENCLAW_API_URL || 'http://localhost:18789'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
