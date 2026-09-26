import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // The demo Server Action reads these original images in serverless deployments.
  outputFileTracingIncludes: { "/*": ["./public/demo/*.png"] },
};
export default config;
