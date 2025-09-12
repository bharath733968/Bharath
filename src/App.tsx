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
  const [setCount, setSetCount] = useState(0);
  const [currentSetReps, setCurrentSetReps] = useState(0);
  const [calories, setCalories] = useState(0);
  const [isDown, setIsDown] = useState(false);
  const [isPushupDown, setIsPushupDown] = useState(false);
  const [running, setRunning] = useState(false);
  const [exercise, setExercise] = useState<"squat" | "pushup">("squat");
  const [message, setMessage] = useState("Click Start to begin your workout");
  const [formFeedback, setFormFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [isResting, setIsResting] = useState(false);
  const [restTimer, setRestTimer] = useState(0);

  // Countdown state and refs
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const restIntervalRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);

  const REPS_PER_SET = 10;
  const REST_TIME = 30; // seconds

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
      clearRestTimer();
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

    // Cancel any queued speech and announce workout start
    speak(`Get ready for ${exercise} workout. Starting in 3, 2, 1`, true);

    countdownIntervalRef.current = window.setInterval(() => {
      // If component unmounted, stop
      if (isUnmountedRef.current) {
        clearCountdown(true);
        return;
      }

      if (counter > 0) {
        // Speak countdown number with emphasis
        speak(String(counter), true);
        setCountdown(counter);
        counter -= 1;
      } else {
        // Final step: clear interval and start workout
        if (countdownIntervalRef.current !== null) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
        // Enthusiastic start command
        speak("Go! Let's do this!", true);

        // Initialize workout state and start
        setRepCount(0);
        setSetCount(0);
        setCurrentSetReps(0);
        setCalories(0);
        setIsDown(false);
        setIsPushupDown(false);
        setFormFeedback("");
        setIsResting(false);
        setRestTimer(0);
        setRunning(true);
        setMessage(`Performing ${exercise}s - get into position!`);
      }
    }, 1000) as unknown as number; // type cast for TS DOM
  }

  // Start rest period between sets
  function startRestPeriod() {
    setIsResting(true);
    setRestTimer(REST_TIME);
    speak(`Excellent set completed! Take a ${REST_TIME} second rest. I'll count you down.`, true);
    setMessage(`Set ${setCount} complete! Rest for ${REST_TIME} seconds`);
    
    restIntervalRef.current = window.setInterval(() => {
      setRestTimer((prev) => {
        if (prev <= 1) {
          if (restIntervalRef.current) {
            window.clearInterval(restIntervalRef.current);
            restIntervalRef.current = null;
          }
          setIsResting(false);
          speak("Rest time is over! Get ready for your next set. You've got this!", true);
          setMessage("Rest complete! Ready for your next set");
          return 0;
        } else if (prev <= 5) {
          // Voice countdown for last 5 seconds of rest
          speak(String(prev), true);
        } else if (prev === 15) {
          speak("15 seconds remaining in your rest period", false);
        } else if (prev === 10) {
          speak("10 seconds left. Get ready!", false);
        }
        return prev - 1;
      });
    }, 1000) as unknown as number;
  }

  // Clear rest timer
  function clearRestTimer() {
    if (restIntervalRef.current !== null) {
      window.clearInterval(restIntervalRef.current);
      restIntervalRef.current = null;
    }
    setRestTimer(0);
    setIsResting(false);
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
    const rightHip = keypoints.find((k) => k.name === "right_hip");
    const rightKnee = keypoints.find((k) => k.name === "right_knee");
    const rightAnkle = keypoints.find((k) => k.name === "right_ankle");
    
    if (hip && knee && ankle && hip.score! > 0.5 && knee.score! > 0.5 && ankle.score! > 0.5) {
      const kneeAngle = angleBetweenThreePoints(hip, knee, ankle);
      
      // Provide real-time form feedback
      if (kneeAngle > 160) {
        setFormFeedback("Standing position - Good posture!");
      } else if (kneeAngle > 120) {
        setFormFeedback("Going down - Keep your back straight!");
      } else if (kneeAngle > 90) {
        setFormFeedback("Almost there - Go a bit lower!");
      } else if (kneeAngle > 70) {
        setFormFeedback("Perfect depth! Now push up!");
      } else {
        setFormFeedback("Too low - Don't go past 90 degrees!");
      }
      
      if (kneeAngle < 90 && !isDown) {
        setIsDown(true);
        speak("Perfect squat depth! Now drive up through your heels!", false);
      }
      
      if (kneeAngle > 160 && isDown) {
        if (!isResting) {
          setRepCount((prev) => prev + 1);
          setCurrentSetReps((prev) => {
            const newSetReps = prev + 1;
            const totalReps = repCount + 1;
            const newCalories = calculateCalories("squat", totalReps);
            setCalories(newCalories);
            
            if (newSetReps >= REPS_PER_SET) {
              setSetCount((prevSets) => prevSets + 1);
              setCurrentSetReps(0);
              speak(`Outstanding! Set ${setCount + 1} completed with perfect form!`, true);
              startRestPeriod();
            } else {
              speak(`${newSetReps} down, ${REPS_PER_SET - newSetReps} to go! Keep it up!`, false);
              setMessage(`Rep ${newSetReps}/${REPS_PER_SET} - Great form!`);
            }
            
            return newSetReps >= REPS_PER_SET ? 0 : newSetReps;
          });
        }
        setIsDown(false);
      }
    }
  }

  function handlePushupDetection(keypoints: poseDetection.Keypoint[]) {
    const shoulder = keypoints.find((k) => k.name === "left_shoulder");
    const elbow = keypoints.find((k) => k.name === "left_elbow");
    const wrist = keypoints.find((k) => k.name === "left_wrist");
    const hip = keypoints.find((k) => k.name === "left_hip");
    
    if (shoulder && elbow && wrist && shoulder.score! > 0.5 && elbow.score! > 0.5 && wrist.score! > 0.5) {
      const elbowAngle = angleBetweenThreePoints(shoulder, elbow, wrist);
      
      // Provide real-time form feedback
      if (elbowAngle > 160) {
        setFormFeedback("Starting position - Keep your body straight!");
      } else if (elbowAngle > 120) {
        setFormFeedback("Going down - Control the movement!");
      } else if (elbowAngle > 90) {
        setFormFeedback("Good depth - Now push up!");
      } else if (elbowAngle > 70) {
        setFormFeedback("Perfect form! Push back up!");
      } else {
        setFormFeedback("Too low - Don't touch the ground!");
      }
      
      if (elbowAngle < 90 && !isPushupDown) {
        setIsPushupDown(true);
        speak("Perfect push-up depth! Now push up strong!", false);
      }
      
      if (elbowAngle > 160 && isPushupDown) {
        if (!isResting) {
          setRepCount((prev) => prev + 1);
          setCurrentSetReps((prev) => {
            const newSetReps = prev + 1;
            const totalReps = repCount + 1;
            const newCalories = calculateCalories("pushup", totalReps);
            setCalories(newCalories);
            
            if (newSetReps >= REPS_PER_SET) {
              setSetCount((prevSets) => prevSets + 1);
              setCurrentSetReps(0);
              speak(`Incredible! Set ${setCount + 1} completed with excellent form!`, true);
              startRestPeriod();
            } else {
              speak(`${newSetReps} reps done, ${REPS_PER_SET - newSetReps} more to go! You're crushing it!`, false);
              setMessage(`Rep ${newSetReps}/${REPS_PER_SET} - Excellent form!`);
            }
            
            return newSetReps >= REPS_PER_SET ? 0 : newSetReps;
          });
        }
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
      clearRestTimer();
      speak("Workout stopped", true);
      setMessage(`Workout paused - ${setCount} sets, ${repCount} total reps`);
    }
  }

  function handleReset() {
    // Stop workout and countdown
    setRepCount(0);
    setSetCount(0);
    setCurrentSetReps(0);
    setCalories(0);
    setIsDown(false);
    setIsPushupDown(false);
    setRunning(false);
    setFormFeedback("");
    setIsResting(false);
    setRestTimer(0);
    clearCountdown(true);
    clearRestTimer();
    speak("Workout has been reset. Ready to start fresh when you are!", true);
    setMessage("Workout reset. Ready to start fresh!");
  }

  function handleExerciseChange(newExercise: "squat" | "pushup") {
    setExercise(newExercise);
    setRepCount(0);
    setSetCount(0);
    setCurrentSetReps(0);
    setCalories(0);
    setIsDown(false);
    setIsPushupDown(false);
    setRunning(false);
    setFormFeedback("");
    setIsResting(false);
    setRestTimer(0);
    clearCountdown(true);
    clearRestTimer();
    speak(`Exercise changed to ${newExercise}s. Click start when you're ready to begin!`, true);
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {/* Current Set Progress */}
            <div className="bg-gray-800 rounded-2xl px-6 py-4 shadow-lg">
              <h3 className="text-2xl font-bold text-blue-400 mb-2">Current Set</h3>
              <p className="text-4xl font-bold text-white">{currentSetReps}/{REPS_PER_SET}</p>
              <p className="text-gray-300 text-sm">Reps in this set</p>
              {isResting && (
                <div className="mt-2">
                  <p className="text-yellow-400 font-bold">Rest: {restTimer}s</p>
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                    <div 
                      className="bg-yellow-400 h-2 rounded-full transition-all duration-1000"
                      style={{ width: `${((REST_TIME - restTimer) / REST_TIME) * 100}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>

            {/* Total Stats */}
            <div className="bg-gray-800 rounded-2xl px-6 py-4 shadow-lg">
              <h3 className="text-2xl font-bold text-green-400 mb-2">Total Stats</h3>
              <p className="text-4xl font-bold text-white">{repCount}</p>
              <p className="text-gray-300 text-sm capitalize">Total {exercise}{repCount !== 1 ? "s" : ""}</p>
              <p className="text-yellow-400 mt-1">🔥 {calories} kcal</p>
            </div>

            {/* Sets Completed */}
            <div className="bg-gray-800 rounded-2xl px-6 py-4 shadow-lg">
              <h3 className="text-2xl font-bold text-purple-400 mb-2">Sets Done</h3>
              <p className="text-4xl font-bold text-white">{setCount}</p>
              <p className="text-gray-300 text-sm">Completed sets</p>
              <p className="text-purple-300 text-xs mt-1">{REPS_PER_SET} reps per set</p>
            </div>
          </div>

            {countdown !== null && (
              <div className="mt-6">
                <p className="text-5xl font-bold text-yellow-400 animate-pulse">
                {countdown === 0 ? "Go!" : countdown}
                </p>
              </div>
            )}
        </div>

        {/* Form Feedback */}
        {formFeedback && running && !isResting && (
          <div className="text-center mb-4">
            <div className="inline-block bg-blue-600 rounded-lg px-6 py-3">
              <p className="text-white font-semibold">💪 {formFeedback}</p>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800 rounded-lg px-4 py-3">
            {message.includes("denied") || message.includes("Failed") ? (
              <AlertCircle size={20} className="text-red-400" />
            ) : isResting ? (
              <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
            ) : (
              <div className={`w-3 h-3 rounded-full ${running ? "bg-green-400 animate-pulse" : "bg-gray-400"}`} />
            )}
            <p className="text-gray-300">{message}</p>
          </div>
        </div>

        {/* Workout Tips */}
        <div className="mt-8 max-w-2xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-xl font-bold text-white mb-4">💡 Workout Tips</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
              {exercise === "squat" ? (
                <>
                  <div>• Keep your back straight</div>
                  <div>• Go down to 90° knee angle</div>
                  <div>• Push through your heels</div>
                  <div>• Keep knees aligned with toes</div>
                </>
              ) : (
                <>
                  <div>• Keep your body in a straight line</div>
                  <div>• Lower until 90° elbow angle</div>
                  <div>• Push up with control</div>
                  <div>• Engage your core throughout</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}