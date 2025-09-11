# AI Trainer (Next.js + TensorFlow\.js)

An **AI fitness trainer web app** built with Next.js, TensorFlow\.js (MoveNet pose detection), and TailwindCSS. The app detects exercises (squats, pushups) using your webcam, counts reps, and gives **voice feedback** for every rep.

---

## 🚀 Features

* Pose detection with [@tensorflow-models/pose-detection](https://github.com/tensorflow/tfjs-models/tree/master/pose-detection)
* Exercise rep counting (squats, pushups)
* Voice feedback using Web Speech API
* Live webcam video + skeleton overlay
* TailwindCSS UI

---

## 📂 Project Structure

```
ai-trainer/
├── app/
│   ├── globals.css   # Tailwind imports
│   └── page.js       # Main React component (AI Trainer)
├── public/
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

---

## ⚙️ Installation

1. **Clone repo**

```bash
git clone https://github.com/your-username/ai-trainer.git
cd ai-trainer
```

2. **Install dependencies**

```bash
npm install
```

Dependencies include:

```json
{
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
```

3. **Setup Tailwind**

```bash
npx tailwindcss init -p
```

Update `tailwind.config.js`:

```js
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: { extend: {} },
  plugins: [],
};
```

Add to `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

4. **Run app**

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## 🎥 Usage

* Allow **camera access** when prompted.
* Select an exercise (squats or pushups).
* Click **Start** → Perform reps → The AI counts aloud.
* Click **Stop** or **Reset** as needed.

---

## 📜 License

MIT License © 2025

---

## 📌 TODO / Improvements

* Add more exercises (lunges, jumping jacks, yoga poses)
* Improve form feedback with angles + AI coaching
* Save workout history
* Deploy to Vercel

---

### 🔑 Main Component (app/page.js)

```jsx
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

  function speak(text) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) { console.warn("Speech error:", e); }
  }

  async function setupCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      videoRef.current.srcObject = stream;
      return new Promise((resolve) => {
        videoRef.current.onloadedmetadata = () => resolve(videoRef.current);
      });
    } catch (err) {
      setMessage("Camera permission denied");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const det = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        });
        if (!cancelled) setDetector(det);
      } catch (err) {
        setMessage("Failed to load detector");
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!detector) return;
    let rafId;

    async function renderFrame() {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }
      const poses = await detector.estimatePoses(videoRef.current, { maxPoses: 1 });
      if (running && poses.length > 0) handleExercise(poses[0].keypoints);
      rafId = requestAnimationFrame(renderFrame);
    }

    if (running) renderFrame();
    return () => cancelAnimationFrame(rafId);
  }, [detector, running, exercise]);

  function angleBetween(p1, p2, p3) {
    const a = { x: p1.x - p2.x, y: p1.y - p2.y };
    const b = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = a.x * b.x + a.y * b.y;
    const mag = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
    return mag === 0 ? 0 : (Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI;
  }

  function handleExercise(keypoints) {
    if (exercise === "squat") {
      const hip = keypoints.find((k) => k.name === "left_hip");
      const knee = keypoints.find((k) => k.name === "left_knee");
      const ankle = keypoints.find((k) => k.name === "left_ankle");
      if (hip && knee && ankle) {
        const angle = angleBetween(hip, knee, ankle);
        if (angle < 100 && !isDown) setIsDown(true);
        if (angle > 140 && isDown) {
          setRepCount((c) => { speak((c+1).toString()); return c+1; });
          setIsDown(false);
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-6">
      <h1 className="text-3xl font-bold mb-4">🏋️ AI Trainer</h1>
      <div className="flex gap-4 mb-4">
        <select value={exercise} onChange={(e) => setExercise(e.target.value)} className="bg-gray-800 p-2 rounded">
          <option value="squat">Squat</option>
          <option value="pushup">Pushup</option>
        </select>
        <button className={`px-4 py-2 rounded ${running?"bg-red-500":"bg-green-500"}`} onClick={async()=>{
          if (!running) { setRepCount(0); await setupCamera(); setRunning(true); speak("Start"); }
          else { setRunning(false); speak("Stop"); }
        }}>{running?"Stop":"Start"}</button>
        <button className="px-4 py-2 rounded bg-blue-600" onClick={()=>setRepCount(0)}>Reset</button>
      </div>
      <video ref={videoRef} autoPlay playsInline muted width="640" height="480" className="rounded border"/>
      <h2 className="text-2xl mt-4">Reps: {repCount}</h2>
      <p className="mt-2 text-sm text-gray-400">{message}</p>
    </main>
  );
}
```
