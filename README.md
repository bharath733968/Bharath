/*
AI Trainer - Next.js (app/page.js) starter

This single-file bundle contains:
1) README / setup instructions
2) package.json (dependencies)
3) tailwind setup snippets
4) The full React client component to place at `app/page.js` (Next.js 13+ App Router)

How to use:
- Create a new Next.js app: `npx create-next-app@latest ai-trainer` and choose the App Router.
- Replace `app/page.js` with the `PAGE_JS` content below (only the content within the PAGE_JS markers).
- Add dependencies from `package.json` (run `npm install` with packages listed) OR simply run:
    npm install @tensorflow/tfjs @tensorflow-models/pose-detection @mediapipe/pose
    npm install tailwindcss postcss autoprefixer
    npx tailwindcss init -p
- Add Tailwind config (example provided below) and import Tailwind in `app/globals.css`.
- Run dev server: `npm run dev` and open http://localhost:3000

Notes:
- This uses MoveNet (via @tensorflow-models/pose-detection) and the browser Speech Synthesis API.
- The code aims to be easy to extend: add more exercise logic, add server-side storage, or connect an LLM for coaching text.

--------------------------------------------------------------------------------
package.json (example dependencies)
--------------------------------------------------------------------------------
{
  "name": "ai-trainer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "13.5.6",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "@tensorflow/tfjs": "4.11.0",
    "@tensorflow-models/pose-detection": "0.0.8",
    "@mediapipe/pose": "0.5.1620242384"
  },
  "devDependencies": {
    "tailwindcss": "3.5.2",
    "postcss": "8.4.23",
    "autoprefixer": "10.4.14"
  }
}

--------------------------------------------------------------------------------
Tailwind config snippet (tailwind.config.js):
--------------------------------------------------------------------------------
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

In app/globals.css add:
@tailwind base;
@tailwind components;
@tailwind utilities;

--------------------------------------------------------------------------------
PAGE_JS - Paste this into app/page.js (replace the file contents)
--------------------------------------------------------------------------------
"use client";

import React, { useEffect, useRef, useState } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";

export default function Home() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [detector, setDetector] = useState(null);
  const [repCount, setRepCount] = useState(0);
  const [isDown, setIsDown] = useState(false);
  const [running, setRunning] = useState(false);
  const [exercise, setExercise] = useState("squat");
  const [message, setMessage] = useState("");

  // text-to-speech helper
  function speak(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel(); // cancel previous
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn("Speech error:", e);
    }
  }

  // Safe camera setup
  async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMessage("Camera not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        return new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => resolve(videoRef.current);
        });
      }
    } catch (err) {
      console.error(err);
      setMessage("Unable to access camera. Please allow camera permission.");
    }
  }

  // Create detector
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const det = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        });
        if (!cancelled) setDetector(det);
      } catch (err) {
        console.error("Failed to create detector", err);
        setMessage("Failed to load pose detector. Check console for details.");
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Main loop
  useEffect(() => {
    if (!detector) return;
    let rafId;
    let runningLocal = running;

    async function renderFrame() {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const video = videoRef.current;
      const poses = await detector.estimatePoses(video, { maxPoses: 1, flipHorizontal: false });

      drawCanvas(poses);

      if (runningLocal && poses && poses.length > 0) {
        const keypoints = poses[0].keypoints;
        if (exercise === "squat") {
          handleSquat(keypoints);
        } else if (exercise === "pushup") {
          handlePushup(keypoints);
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    }

    if (running) {
      runningLocal = true;
      renderFrame();
    }

    return () => {
      runningLocal = false;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [detector, running, exercise]);

  // draw keypoints and skeleton
  function drawCanvas(poses) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!poses || poses.length === 0) return;

    const keypoints = poses[0].keypoints;
    // draw keypoints
    for (const kp of keypoints) {
      if (kp.score > 0.4) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#00FFAA";
        ctx.fill();
      }
    }

    // draw simple lines between major joints
    function line(aName, bName) {
      const a = keypoints.find((k) => k.name === aName);
      const b = keypoints.find((k) => k.name === bName);
      if (a && b && a.score > 0.4 && b.score > 0.4) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#00FFAA";
        ctx.stroke();
      }
    }

    line("left_shoulder", "left_elbow");
    line("left_elbow", "left_wrist");
    line("right_shoulder", "right_elbow");
    line("right_elbow", "right_wrist");
    line("left_hip", "left_knee");
    line("left_knee", "left_ankle");
    line("right_hip", "right_knee");
    line("right_knee", "right_ankle");
  }

  // Helper to compute angle between three points (in degrees)
  function angleBetween(p1, p2, p3) {
    // p2 is the vertex point
    const a = { x: p1.x - p2.x, y: p1.y - p2.y };
    const b = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = a.x * b.x + a.y * b.y;
    const magA = Math.hypot(a.x, a.y);
    const magB = Math.hypot(b.x, b.y);
    if (magA * magB === 0) return 0;
    let cos = dot / (magA * magB);
    cos = Math.min(1, Math.max(-1, cos));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  // Simple squat detection: use hip-knee-ankle vertical relation and knee angle
  function handleSquat(keypoints) {
    const leftHip = keypoints.find((k) => k.name === "left_hip");
    const rightHip = keypoints.find((k) => k.name === "right_hip");
    const leftKnee = keypoints.find((k) => k.name === "left_knee");
    const rightKnee = keypoints.find((k) => k.name === "right_knee");
    const leftAnkle = keypoints.find((k) => k.name === "left_ankle");
    const rightAnkle = keypoints.find((k) => k.name === "right_ankle");

    if (!leftHip || !leftKnee || !leftAnkle) return;
    // Use average positions to reduce noise
    const hip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const knee = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };
    const ankle = { x: (leftAnkle.x + rightAnkle.x) / 2, y: (leftAnkle.y + rightAnkle.y) / 2 };

    // knee angle (hip - knee - ankle)
    const kneeAngle = angleBetween(hip, knee, ankle);

    // Determine squat "down" by knee angle threshold (smaller angle -> deeper squat)
    const downThreshold = 100; // tune this
    const upThreshold = 140; // when standing up

    if (kneeAngle < downThreshold && !isDown) {
      setIsDown(true);
      setMessage("Down");
    }

    if (kneeAngle > upThreshold && isDown) {
      setRepCount((prev) => {
        const n = prev + 1;
        speak(n.toString());
        return n;
      });
      setIsDown(false);
      setMessage("Up");
    }

    // Basic form feedback: check torso angle (should be relatively upright)
    const leftShoulder = keypoints.find((k) => k.name === "left_shoulder");
    const rightShoulder = keypoints.find((k) => k.name === "right_shoulder");
    if (leftShoulder && rightShoulder) {
      const shoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
      // angle between shoulder-hip-knee (torso lean)
      const torsoAngle = angleBetween(shoulder, hip, knee);
      if (torsoAngle < 40) {
        // torso leaning too much forward
        setMessage("Try to keep your torso more upright");
      }
    }
  }

  // Simple pushup detection (vertical distance between shoulders and hips)
  function handlePushup(keypoints) {
    const leftShoulder = keypoints.find((k) => k.name === "left_shoulder");
    const rightShoulder = keypoints.find((k) => k.name === "right_shoulder");
    const leftHip = keypoints.find((k) => k.name === "left_hip");
    const rightHip = keypoints.find((k) => k.name === "right_hip");

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return;

    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;

    // When doing a pushup the shoulders will move closer to the ground (higher y)
    const downThreshold = hipY - shoulderY > 30; // tune

    if (downThreshold && !isDown) {
      setIsDown(true);
      setMessage("Down");
    }

    if (!downThreshold && isDown) {
      setRepCount((prev) => {
        const n = prev + 1;
        speak(n.toString());
        return n;
      });
      setIsDown(false);
      setMessage("Up");
    }
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6">
      <div className="max-w-3xl w-full">
        <h1 className="text-3xl font-bold mb-4">🏋️ AI Trainer</h1>

        <div className="flex gap-4 mb-4 items-center">
          <label className="flex items-center gap-2">
            <span>Exercise:</span>
            <select className="bg-gray-800 p-2 rounded" value={exercise} onChange={(e) => setExercise(e.target.value)}>
              <option value="squat">Squat</option>
              <option value="pushup">Pushup</option>
            </select>
          </label>

          <button
            className={`px-4 py-2 rounded ${running ? "bg-red-500" : "bg-green-500"}`}
            onClick={async () => {
              if (!running) {
                setRepCount(0);
                await setupCamera();
                // ensure detector ready
                if (!detector) setMessage("Detector not ready yet.");
                setRunning(true);
                speak("Starting workout");
              } else {
                setRunning(false);
                speak("Workout paused");
              }
            }}
          >
            {running ? "Stop" : "Start"}
          </button>

          <button
            className="px-4 py-2 rounded bg-blue-600"
            onClick={() => {
              setRepCount(0);
              setMessage("");
            }}
          >
            Reset
          </button>
        </div>

        <div className="relative bg-black rounded-lg overflow-hidden" style={{ width: 640, height: 480 }}>
          <video ref={videoRef} className="absolute left-0 top-0" playsInline autoPlay muted width={640} height={480} />
          <canvas ref={canvasRef} className="absolute left-0 top-0" />
        </div>

        <div className="mt-4 flex items-center gap-6">
          <div>
            <h2 className="text-xl">Reps</h2>
            <div className="text-4xl font-bold">{repCount}</div>
          </div>

          <div>
            <h2 className="text-xl">Status</h2>
            <div className="text-lg">{message}</div>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-300">Make sure you are visible in the webcam and allow camera permissions. The detection is basic — tune thresholds for reliability.</p>
      </div>
    </main>
  );
}

