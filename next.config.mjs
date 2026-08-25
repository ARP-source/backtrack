/** @type {import('next').NextConfig} */
const nextConfig = {
  // The embedding model runs server-side via onnxruntime; keep it out of the bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
};

export default nextConfig;
