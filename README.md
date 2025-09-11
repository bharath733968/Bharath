Create a Next.js web application called "AI Fitness Trainer". 

Features:
1. Open the user's webcam and detect body poses in real-time using TensorFlow.js MoveNet or MediaPipe Pose.
2. Track exercises (start with squats as an example).
3. Count reps automatically whenever a squat is completed.
4. Speak the rep count aloud using the Web Speech API (say “1, 2, 3…”).
5. Show a clean UI:
   - Title: "🏋️ AI Trainer"
   - Webcam video stream in the center with a border
   - Rep counter below the video
   - Dark background with modern styling (Tailwind CSS)

Tech requirements:
- Use Next.js with React
- Install @tensorflow/tfjs, @tensorflow-models/pose-detection, and @mediapipe/pose
- Use Tailwind CSS for styling
- Keep the code modular and easy to extend (later I want to add pushups, jumping jacks, etc.)

