/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // serverActions are stable in 14, leaving a placeholder if we need tuning
  },
};

module.exports = nextConfig;
