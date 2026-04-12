/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native module: load from node_modules at runtime (API routes / Node)
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
  // Polling in dev avoids macOS EMFILE (too many file watchers), which can break the dev
  // bundle and show "missing required error components, refreshing..." forever.
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
