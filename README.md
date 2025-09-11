"use client";

import React, { useEffect, useRef, useState } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import * as tf from "@tensorflow/tfjs";
import { Play, Square, RotateCcw, Camera, AlertCircle } from "lucide-react";

export default function AITrainer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [detector, setDetector] = useState<poseDetection.PoseDetector | null>(null);
  const [repCount, setRepCount] = useState(0);
  const [calories, setCalories] = useState(0);
  const [isDown, setIsDown] = useState(false);
  const [isPushupDown, setIsPushupDown] = useState(false);
  const [running, setRunning] = useState(false);
  const [exercise, setExercise] = useState<"squat" | "pushup">("squat");
  const [message, setMessage] = useState("Click Start to begin your workout");
  const [loading, setLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);

  // Countdown state and refs
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);

  // Speak with optional interrupt flag
  function speak(text: string, interrupt = false) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      if (interrupt) window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Speech synthesis error:", error);
    }
  }

  // Simple calories per rep estimate
  function calculateCalories(exercise: "squat" | "pushup", reps: number) {
    const caloriesPerRep = exercise === "squat" ? 0.32 : 0.29;
    return parseFloat((reps * caloriesPerRep).toFixed(2));
  }

  async function setupCamera(): Promise<boolean> {
    try {
      setMessage("Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        return new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              setCameraReady(true);
              setMessage("Camera ready! Select an exercise and start your workout");
              resolve(true);
            };
          }
        });
      }
      return false;
    } catch (error) {
      console.error("Camera setup error:", error);
      setMessage("Camera access denied. Please allow camera permissions and refresh the page.");
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initializeDetector() {
      try {
        setMessage("Loading AI model...");
        await tf.setBackend("webgl");
        await tf.ready();
        const det = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        });

        if (!cancelled) {
          setDetector(det);
          setLoading(false);
          await setupCamera();
        }
      } catch (error) {
        console.error("Detector initialization error:", error);
        setMessage("Failed to load AI model. Please refresh the page.");
        setLoading(false);
      }
    }

    initializeDetector();

    return () => {
      cancelled = true;
    };
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      clearCountdown(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear countdown helper (safe to call multiple times)
  function clearCountdown(cancelSpeech = true) {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (cancelSpeech && typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    }
    setCountdown(null);
  }

  // Start a 3-second countdown, robust and safe
  function startCountdown() {
    // Prevent multiple countdowns
    if (countdownIntervalRef.current !== null) return;

    let counter = 3;
    setCountdown(counter);

    // cancel any queued speech so the countdown will start cleanly
    speak(`Get ready for ${exercise} workout`, true);

    // Speak numbers without interrupting each other so they queue naturally
    countdownIntervalRef.current = window.setInterval(() => {
      // If component unmounted, stop
      if (isUnmountedRef.current) {
        clearCountdown(true);
        return;
      }

      if (counter > 0) {
        // Queue the spoken number (do not interrupt previous number so speech flows)
        speak(String(counter), false);
        setCountdown(counter);
        counter -= 1;
      } else {
        // Final step: clear interval and start workout
        if (countdownIntervalRef.current !== null) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
        // Allow "Go!" to be spoken immediately after the last number
        speak("Go!", false);

        // Initialize workout state and start
        setRepCount(0);
        setCalories(0);
        setIsDown(false);
        setIsPushupDown(false);
        setRunning(true);
        setMessage(`Performing ${exercise}s - get into position!`);
      }
    }, 1000) as unknown as number; // type cast for TS DOM
  }

  useEffect(() => {
    if (!detector || !running || !cameraReady) return;

    let rafId: number;
    let lastPoseTime = 0;
    const poseInterval = 100; // ms

    async function detectPose() {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        rafId = requestAnimationFrame(detectPose);
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastPoseTime >= poseInterval) {
        try {
          const poses = await detector.estimatePoses(videoRef.current as HTMLVideoElement, { maxPoses: 1, flipHorizontal: false });
          if (poses.length > 0) {
            handleExercise(poses[0].keypoints);
            drawPose(poses[0].keypoints);
          }
        } catch (error) {
          console.error("Pose detection error:", error);
        }
        lastPoseTime = currentTime;
      }

      rafId = requestAnimationFrame(detectPose);
    }

    detectPose();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [detector, running, exercise, cameraReady]);

  function drawPose(keypoints: poseDetection.Keypoint[]) {
    if (!canvasRef.current || !videoRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#00ff00";
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;

    keypoints.forEach((kp) => {
      if (kp.score && kp.score > 0.3) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  function angleBetweenThreePoints(p1: any, p2: any, p3: any): number {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
    const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cos = dot / (mag1 * mag2);
    return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  }

  function handleExercise(keypoints: poseDetection.Keypoint[]) {
    if (exercise === "squat") handleSquatDetection(keypoints);
    else if (exercise === "pushup") handlePushupDetection(keypoints);
  }

  function handleSquatDetection(keypoints: poseDetection.Keypoint[]) {
    const hip = keypoints.find((k) => k.name === "left_hip");
    const knee = keypoints.find((k) => k.name === "left_knee");
    const ankle = keypoints.find((k) => k.name === "left_ankle");
    if (hip && knee && ankle && hip.score! > 0.5 && knee.score! > 0.5 && ankle.score! > 0.5) {
      const kneeAngle = angleBetweenThreePoints(hip, knee, ankle);
      if (kneeAngle < 90 && !isDown) {
        setIsDown(true);
        setMessage("Good form! Now stand up!");
      }
      if (kneeAngle > 160 && isDown) {
        setRepCount((prev) => {
          const newCount = prev + 1;
          const newCalories = calculateCalories("squat", newCount);
          setCalories(newCalories);
          speak(`${newCount} reps, ${newCalories} calories`, true);
          setMessage(`Great squat! ${newCount} reps, ~${newCalories} kcal`);
          return newCount;
        });
        setIsDown(false);
      }
    }
  }

  function handlePushupDetection(keypoints: poseDetection.Keypoint[]) {
    const shoulder = keypoints.find((k) => k.name === "left_shoulder");
    const elbow = keypoints.find((k) => k.name === "left_elbow");
    const wrist = keypoints.find((k) => k.name === "left_wrist");
    if (shoulder && elbow && wrist && shoulder.score! > 0.5 && elbow.score! > 0.5 && wrist.score! > 0.5) {
      const elbowAngle = angleBetweenThreePoints(shoulder, elbow, wrist);
      if (elbowAngle < 90 && !isPushupDown) {
        setIsPushupDown(true);
        setMessage("Good form! Now push up!");
      }
      if (elbowAngle > 160 && isPushupDown) {
        setRepCount((prev) => {
          const newCount = prev + 1;
          const newCalories = calculateCalories("pushup", newCount);
          setCalories(newCalories);
          speak(`${newCount} reps, ${newCalories} calories`, true);
          setMessage(`Excellent pushup! ${newCount} reps, ~${newCalories} kcal`);
          return newCount;
        });
        setIsPushupDown(false);
      }
    }
  }

  async function handleStart() {
    // Ensure camera is ready before starting countdown or running
    if (!running && !cameraReady) {
      const success = await setupCamera();
      if (!success) return;
    }

    // If currently not running, start countdown (or cancel if countdown already active)
    if (!running) {
      if (countdownIntervalRef.current !== null) {
        // Cancel active countdown
        clearCountdown(true);
        speak("Countdown cancelled", true);
        setMessage("Countdown cancelled");
        return;
      }

      // Start the countdown that will set `running` to true when finished
      startCountdown();
    } else {
      // If workout is running, stop it
      setRunning(false);
      // Also clear any countdown just in case
      clearCountdown(true);
      speak("Workout stopped", true);
      setMessage(`Workout paused at ${repCount} reps`);
    }
  }

  function handleReset() {
    // Stop workout and countdown
    setRepCount(0);
    setCalories(0);
    setIsDown(false);
    setIsPushupDown(false);
    setRunning(false);
    clearCountdown(true);
    speak("Workout reset", true);
    setMessage("Workout reset. Ready to start fresh!");
  }

  function handleExerciseChange(newExercise: "squat" | "pushup") {
    setExercise(newExercise);
    setRepCount(0);
    setCalories(0);
    setIsDown(false);
    setIsPushupDown(false);
    setRunning(false);
    clearCountdown(true);
    setMessage(`Exercise changed to ${newExercise}s. Click Start when ready!`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-500 mb-4"></div>
        <h1 className="text-2xl font-semibold mb-2">Loading AI Fitness Trainer</h1>
        <p className="text-gray-400">Initializing pose detection model...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-2">🏋️ AI Fitness Trainer</h1>
          <p className="text-gray-400 text-lg">AI-powered rep counting with calorie tracking</p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-4 mb-6">
          <select
            value={exercise}
            onChange={(e) => handleExerciseChange(e.target.value as "squat" | "pushup")}
            className="bg-gray-800 border border-gray-600 text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500"
            disabled={running}
          >
            <option value="squat">Squats</option>
            <option value="pushup">Push-ups</option>
          </select>

          <button
            onClick={handleStart}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${
              running ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {running ? <Square size={20} /> : <Play size={20} />}
            {running ? "Stop Workout" : "Start Workout"}
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
          >
            <RotateCcw size={20} /> Reset
          </button>
        </div>

        {/* Video + Canvas */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl">
            <video ref={videoRef} autoPlay playsInline muted className="max-w-full h-auto" style={{ maxWidth: '640px', maxHeight: '480px' }} />
            <canvas ref={canvasRef} className="absolute top-0 left-0 pointer-events-none" style={{ maxWidth: '640px', maxHeight: '480px' }} />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <Camera size={48} className="mx-auto mb-4 text-gray-400" />
                <p className="text-gray-400">Camera loading...</p>
              </div>
            )}
          </div>
        </div>

        {/* Rep Counter + Calories + Countdown */}
        <div className="text-center mb-6">
          <div className="inline-block bg-gray-800 rounded-2xl px-8 py-6 shadow-lg">
            <h2 className="text-6xl md:text-7xl font-bold text-green-400 mb-2">{repCount}</h2>
            <p className="text-xl text-gray-300 capitalize">{exercise}{repCount !== 1 ? "s" : ""} Completed</p>
            <p className="text-lg text-yellow-400 mt-2">🔥 {calories} kcal burned</p>

            {countdown !== null && (
              <p className="text-5xl font-bold text-yellow-400 mt-4 animate-pulse">
                {countdown === 0 ? "Go!" : countdown}
              </p>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-3">
            {message.includes("denied") || message.includes("Failed") ? (
              <AlertCircle size={20} className="text-red-400" />
            ) : (
              <div className={`w-3 h-3 rounded-full ${running ? "bg-green-400 animate-pulse" : "bg-gray-400"}`} />
            )}
            <p className="text-gray-300">{message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
