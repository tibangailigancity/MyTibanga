import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Lock Turbopack to this app when another package-lock.json exists higher on the drive (e.g. C:\Users\...)
    turbopack: {
        root: __dirname,
    },
    // Use Windows/macOS trust store for Turbopack fetches (Google Fonts during build) when corporate TLS breaks default chain
    experimental: {
        turbopackUseSystemTlsCerts: true,
    },
    serverExternalPackages: ['face-api.js', 'canvas', '@tensorflow/tfjs-core', '@tensorflow/tfjs-converter'],
};

export default nextConfig;
