import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@desk/shared'],
  devIndicators: false,
};

export default nextConfig;
