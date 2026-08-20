/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@job-app/shared"],
  webpack: (config) => {
    // @job-app/shared is consumed both by tsc (NodeNext resolution, which
    // requires explicit ".js" extensions on relative imports even though
    // the files are ".ts") and by webpack here, which doesn't do that
    // remapping on its own. extensionAlias teaches webpack to resolve a
    // ".js" specifier to the sibling ".ts"/".tsx" file when present.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
