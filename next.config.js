/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native module: load from node_modules at runtime (API routes / Node)
  // (Next 15+: was experimental.serverComponentsExternalPackages)
  serverExternalPackages: ["better-sqlite3"],
  // Next 16 defaults to Turbopack; an empty object acknowledges Turbopack when a custom
  // `webpack` hook exists below (avoids errors if someone runs `next build` without --webpack).
  turbopack: {},
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
