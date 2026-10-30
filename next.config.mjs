/** @type {import('next').NextConfig} */
const config = {
  outputFileTracingIncludes: { '/api/chat': ['./data/corpus.json'] },
  poweredByHeader: false,
};
export default config;
