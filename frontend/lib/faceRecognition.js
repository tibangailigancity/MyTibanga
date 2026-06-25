/**
 * Server-side face recognition using face-api.js + node-canvas.
 *
 * Models are loaded once and cached in memory.
 * All face detection / descriptor extraction happens here on the server.
 * The client only needs to send a base64 JPEG image.
 */

import * as faceapi from 'face-api.js';
import canvas from 'canvas';
import path from 'path';

const { Canvas, Image, ImageData } = canvas;

// Patch face-api.js to use node-canvas instead of browser DOM
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODEL_PATH = path.join(process.cwd(), 'public', 'models');
const MATCH_THRESHOLD = 0.6;

let modelsLoaded = false;

async function ensureModels() {
    if (modelsLoaded) return;
    await faceapi.nets.tinyFaceDetector.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_PATH);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_PATH);
    modelsLoaded = true;
}

/**
 * Decode a base64 data-URL or raw base64 string into a node-canvas Image.
 */
function decodeBase64Image(base64) {
    const data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(data, 'base64');
    const img = new Image();
    img.src = buffer;
    return img;
}

/**
 * Extract a 128-dimensional face descriptor from a base64 image.
 * Returns { descriptor: number[] } on success, or { error: string } on failure.
 */
export async function extractDescriptor(base64Image) {
    await ensureModels();

    const img = decodeBase64Image(base64Image);
    const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) {
        return { error: 'No face detected in the image. Please try again.' };
    }

    return { descriptor: Array.from(detection.descriptor) };
}

/**
 * Compare a descriptor against a list of stored admin descriptors.
 * Returns the best match if within threshold, or null.
 */
export function findMatch(descriptor, adminRows) {
    let bestMatch = null;
    let bestDistance = Infinity;

    for (const admin of adminRows) {
        const stored = admin.face_descriptor;
        if (!Array.isArray(stored) || stored.length !== 128) continue;

        let sum = 0;
        for (let i = 0; i < 128; i++) {
            sum += (descriptor[i] - stored[i]) ** 2;
        }
        const distance = Math.sqrt(sum);

        if (distance < bestDistance) {
            bestDistance = distance;
            bestMatch = admin;
        }
    }

    if (!bestMatch || bestDistance > MATCH_THRESHOLD) return null;

    return {
        admin: bestMatch,
        distance: bestDistance,
        confidence: Math.round((1 - bestDistance / MATCH_THRESHOLD) * 100),
    };
}
