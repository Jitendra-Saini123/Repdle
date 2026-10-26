// Interactive Exercise Guide: Visual demonstration (animated skeleton + video fallback),
// camera placement guidance, what counts as a rep, and common mistakes.
import { EXERCISES, exerciseName } from './rules.js';
import { sheet, esc, $ } from './ui.js';

export const EXERCISE_GUIDES = {
  squat: {
    emoji: '🦵',
    camera: {
      view: 'Side view',
      icon: '📱↔️',
      distance: '2–3 metres away',
      placement: 'Phone or laptop low (on a chair or floor). Make sure your head and feet are both inside the frame.',
    },
    standard: {
      name: 'Squats',
      target: 'Knee angle ≤ 100° (thighs parallel to floor)',
      whatCounts: [
        'Push your hips back and bend knees until thighs are parallel to the floor (100° knee bend).',
        'Stand all the way back up to full standing lockout (knees straight, hips open).',
      ],
      rejections: [
        'Half-squats (not going low enough) get "Go lower ⬇️" and will NEVER count.',
        'Squatting with legs outside the camera frame gets "Step back 👣".',
      ],
      tips: [
        'Keep your heels flat on the floor the entire time.',
        'Chest stays up, knees track in direction of your toes.',
      ],
    },
    lowImpact: {
      name: 'Chair squats',
      target: 'Knee angle ≤ 115° (touch chair and stand)',
      whatCounts: [
        'Place a chair or sturdy bench behind you.',
        'Lower hips until you gently touch the chair (115° knee bend), then stand fully tall.',
      ],
      rejections: [
        'Resting/relaxing on the chair instead of maintaining continuous movement.',
        'Standing only halfway up before sitting again.',
      ],
      tips: [
        'Keep your core tight as you tap the chair.',
        'Push through your heels to stand back up.',
      ],
    },
  },

  pushup: {
    emoji: '💪',
    camera: {
      view: 'Side view',
      icon: '📱📐',
      distance: '1.5–2.5 metres away',
      placement: 'Phone on the floor, side-on to your body. Entire body from head to feet must be visible.',
    },
    standard: {
      name: 'Push-ups',
      target: 'Elbow angle ≤ 100° with straight body',
      whatCounts: [
        'Body in a horizontal plank position: straight line from shoulders through hips to ankles (≥ 145°).',
        'Lower chest until elbows bend to 90°–100°, then push back to full arm extension.',
      ],
      rejections: [
        'Standing arm curls or standing against a wall will NOT count (body must be horizontal!).',
        'Sagging hips or piking hips in the air gets "Keep your body straight".',
        'Bending elbows only halfway gets "Chest lower ⬇️".',
      ],
      tips: [
        'Squeeze your glutes and core to keep your body as rigid as a plank.',
        'Hands placed just slightly wider than shoulder width.',
      ],
    },
    lowImpact: {
      name: 'Knee push-ups',
      target: 'Elbow angle ≤ 100° with knees on floor',
      whatCounts: [
        'Knees resting on the floor or mat, straight line from head through hips to knees.',
        'Lower chest until elbows bend to 90°–100°, then push back up.',
      ],
      rejections: [
        'Hips sticking straight up in the air (butt back).',
        'Partial arm bends without lowering the chest.',
      ],
      tips: [
        'Place a soft mat or towel under your knees.',
        'Keep your neck neutral looking down at the floor.',
      ],
    },
  },

  jack: {
    emoji: '⭐',
    camera: {
      view: 'Front view',
      icon: '📱👤',
      distance: '2–3 metres away',
      placement: 'Face the camera directly. Ensure both hands overhead and both feet are visible in the frame.',
    },
    standard: {
      name: 'Jumping jacks',
      target: 'Hands meet overhead (≥ 140°) + feet wide (≥ 45% leg length)',
      whatCounts: [
        'Jump feet wide (wider than shoulder width) while swinging arms all the way overhead.',
        'Jump feet back together while bringing arms back down to sides.',
      ],
      rejections: [
        'Moving arms only while feet stay still will NOT count ("Feet wider ↔").',
        'Low arm swings (stopping at shoulder height) get "Arms all the way up ⬆️".',
        'Forward bends / toe touches or burpee get-ups will not register as jacks.',
      ],
      tips: [
        'Land softly on the balls of your feet with slightly bent knees.',
        'Keep a steady, rhythmic bounce.',
      ],
    },
    lowImpact: {
      name: 'Step jacks',
      target: 'Arms overhead + one foot steps wide (no jump)',
      whatCounts: [
        'Step one foot out to the side while raising arms overhead.',
        'Step back to center, then step the other foot out as arms raise again.',
      ],
      rejections: [
        'Not stepping far enough out to the side.',
        'Not raising arms fully overhead.',
      ],
      tips: [
        'Completely non-impact: ideal for apartment living or joint sensitivities.',
        'Keep pace high to maintain cardio output.',
      ],
    },
  },

  lunge: {
    emoji: '🚶',
    camera: {
      view: 'Side view',
      icon: '📱↔️',
      distance: '2–3 metres away',
      placement: 'Side view so both legs can be tracked. Full body head-to-toe in picture.',
    },
    standard: {
      name: 'Lunges',
      target: 'Both knees bend to ≤ 115° in split stance',
      whatCounts: [
        'Take a large step forward into a split stance (feet ≥ 50% leg length apart).',
        'Lower hips until both front and back knees bend to ~90°–115°, then drive back to standing.',
        'Alternate legs with each rep.',
      ],
      rejections: [
        'Squatting in place with feet side-by-side gets "Bigger step — one foot forward".',
        'Shallow dipping without bending the back knee gets "Lower — both knees bend ⬇️".',
      ],
      tips: [
        'Keep your front knee stacked directly over or just behind your ankle.',
        'Torso remains upright and tall throughout.',
      ],
    },
    lowImpact: {
      name: 'Supported split squats',
      target: 'Split stance with hand support, knee to ≤ 125°',
      whatCounts: [
        'Hold onto a chair, wall, or sturdy surface for support.',
        'Stay in a stationary split stance and move straight down and up.',
      ],
      rejections: [
        'Taking a stance that is too short, pushing front knee far past the toes.',
        'Leaning heavily on the chair instead of using leg muscles.',
      ],
      tips: [
        'Switch lead leg at the 30-second mark to balance both sides.',
        'The chair provides balance so you can focus on controlled depth.',
      ],
    },
  },

  plank: {
    emoji: '🪵',
    camera: {
      view: 'Side view',
      icon: '📱📐',
      distance: '1.5–2.5 metres away',
      placement: 'Phone on the floor, side view. Allow motion sensor access if phone is on its side.',
    },
    standard: {
      name: 'Plank',
      target: 'Held straight line (≥ 155°) for continuous seconds',
      whatCounts: [
        'Forearms or palms on the floor with elbows/hands directly beneath shoulders.',
        'Hold a straight, rigid line from head through hips to heels.',
        'Every full second held correctly adds to your score.',
      ],
      rejections: [
        'Hips sagging toward floor prompts "Lift your hips".',
        'Hips sticking up in a pike prompts "Lower your hips".',
        'Standing upright or lying flat on your belly will not count.',
      ],
      tips: [
        'Squeeze your glutes, draw your belly button in, and breathe steadily.',
        'Brief tracking glitches under 600ms are bridged so your timer does not drop.',
      ],
    },
    lowImpact: {
      name: 'Knee plank',
      target: 'Held straight line (≥ 150°) from head to knees',
      whatCounts: [
        'Forearms or palms on floor, knees resting on the ground behind you.',
        'Hold a straight line from head and shoulders through hips to knees.',
      ],
      rejections: [
        'Hips bent at 90° (tabletop position) rather than an extended plank angle.',
        'Hips sagging down toward the floor.',
      ],
      tips: [
        'Pad knees with a mat or folded blanket.',
        'Excellent for building core strength before progressing to full plank.',
      ],
    },
  },

  wallsit: {
    emoji: '🧱',
    camera: {
      view: 'Side view',
      icon: '📱🧱',
      distance: '2–3 metres away',
      placement: 'Side view of you against the wall. Full body in frame.',
    },
    standard: {
      name: 'Wall sit',
      target: 'Back flat on wall, knees 65°–115° (thighs parallel)',
      whatCounts: [
        'Slide down until thighs are parallel to the floor (knees bent at ~90°).',
        'Back firmly pressed against the wall, shins perpendicular to the floor.',
      ],
      rejections: [
        'Sitting too high (knees > 115°) prompts "Slide lower ⬇️".',
        'Slumping or peeling back off the wall prompts "Back flat against the wall".',
      ],
      tips: [
        'Do not rest hands or elbows on your thighs — hold them at your chest or sides.',
        'Press your entire spine and shoulder blades against the wall.',
      ],
    },
    lowImpact: {
      name: 'High wall sit',
      target: 'Back flat on wall, knees bent halfway (100°–150°)',
      whatCounts: [
        'Back flat against the wall, knees bent only halfway (around 120°–130°).',
        'Hold position steadily against the wall.',
      ],
      rejections: [
        'Standing completely upright with knees locked.',
        'Hands pushing down on knees.',
      ],
      tips: [
        'Much friendlier on knee joints while still building quad endurance.',
        'Focus on deep, calm breathing.',
      ],
    },
  },
};

// ---------------- Visual Skeleton Animator ----------------
// Mathematical joint kinematics to draw a dynamic, realistic athletic skeleton loop.
const DEG = Math.PI / 180;

function computePose(exKey, v, t, mode = 'good') {
  // t is normalized cycle [0..1]
  const phase = 0.5 - 0.5 * Math.cos(t * Math.PI * 2); // 0 (start) -> 1 (peak) -> 0 (end)

  if (exKey === 'squat') {
    const bottom = mode === 'bad' ? 128 : (v === 1 ? 112 : 95);
    const knee = 170 - (170 - bottom) * phase;
    const h = ((180 - knee) / 2) * DEG;
    const A = [0.42, 0.88];
    const K = [A[0] + 0.22 * Math.sin(h), A[1] - 0.22 * Math.cos(h)];
    const H = [K[0] - 0.22 * Math.sin(h), K[1] - 0.22 * Math.cos(h)];
    const lean = h * 0.75;
    const S = [H[0] + 0.3 * Math.sin(lean), H[1] - 0.3 * Math.cos(lean)];
    const E = [S[0] + 0.09, S[1] + 0.1];
    const W = [S[0] + 0.18, S[1] + 0.05];
    const N = [S[0] + 0.07 * Math.sin(lean), S[1] - 0.09 * Math.cos(lean)];
    return { S, E, W, H, K, A, N, knee, depthReached: knee <= 100 || (v === 1 && knee <= 115) };
  }

  if (exKey === 'pushup') {
    const bottom = mode === 'bad' ? 130 : 92;
    const elbow = 165 - (165 - bottom) * phase;
    const isKnees = v === 1;
    const a = 0.14, b = 0.14;
    const d = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(elbow * DEG));
    const W = [0.26, 0.82];
    const S = [0.26, W[1] - d];
    const mid = [(S[0] + W[0]) / 2, (S[1] + W[1]) / 2];
    const off = Math.sqrt(Math.max(0, a * a - (d / 2) ** 2));
    const E = [mid[0] + off, mid[1]];
    const A = isKnees ? [0.65, 0.84] : [0.82, 0.84];
    const sag = mode === 'bad' ? 0.08 * phase : 0;
    const H = [(S[0] + A[0]) / 2, (S[1] + A[1]) / 2 + sag];
    const K = isKnees ? A : [(H[0] + A[0]) / 2, (H[1] + A[1]) / 2];
    const N = [S[0] - 0.08, S[1] - 0.02];
    return { S, E, W, H, K, A, N, elbow, isKnees, depthReached: elbow <= 100 };
  }

  if (exKey === 'jack') {
    const maxRaise = mode === 'bad' ? 85 : 155;
    const maxSpread = mode === 'bad' ? 0.04 : (v === 1 ? 0.22 : 0.26);
    const raise = 20 + (maxRaise - 20) * phase;
    const spread = maxSpread * phase;
    const S_L = [0.44, 0.32], S_R = [0.56, 0.32];
    const H_L = [0.46, 0.54], H_R = [0.54, 0.54];
    const armL = [S_L[0] - 0.26 * Math.sin(raise * DEG), S_L[1] + 0.26 * Math.cos(raise * DEG)];
    const armR = [S_R[0] + 0.26 * Math.sin(raise * DEG), S_R[1] + 0.26 * Math.cos(raise * DEG)];
    const E_L = [(S_L[0] + armL[0]) / 2, (S_L[1] + armL[1]) / 2];
    const E_R = [(S_R[0] + armR[0]) / 2, (S_R[1] + armR[1]) / 2];
    const footL = v === 1 ? [0.46, 0.88] : [0.46 - spread, 0.88];
    const footR = [0.54 + spread, 0.88];
    const K_L = [(H_L[0] + footL[0]) / 2, 0.71];
    const K_R = [(H_R[0] + footR[0]) / 2, 0.71];
    const N = [0.5, 0.22];
    return {
      front: true,
      S_L, S_R, E_L, E_R, W_L: armL, W_R: armR,
      H_L, H_R, K_L, K_R, A_L: footL, A_R: footR,
      N, raise, depthReached: raise >= 140 && spread >= (v === 1 ? 0.18 : 0.22)
    };
  }

  if (exKey === 'lunge') {
    const bottom = mode === 'bad' ? 135 : (v === 1 ? 122 : 98);
    const knee = 165 - (165 - bottom) * phase;
    const stance = mode === 'bad' ? 0.16 : 0.38;
    const L = 0.22;
    const d = Math.sqrt(2 * L * L - 2 * L * L * Math.cos(knee * DEG));
    const F = [0.48 - stance / 2, 0.88], B = [0.48 + stance / 2, 0.88];
    const half = stance / 2;
    const H = [0.48, 0.88 - Math.sqrt(Math.max(0.0001, d * d - half * half))];
    const kneeFront = [(H[0] + F[0]) / 2 - 0.05, (H[1] + F[1]) / 2 + 0.02];
    const kneeBack = [(H[0] + B[0]) / 2 + 0.05, (H[1] + B[1]) / 2 + 0.02];
    const S = [H[0] - 0.02, H[1] - 0.3];
    const E = [S[0] + 0.04, S[1] + 0.14];
    const W = [S[0] + 0.06, S[1] + 0.25];
    const N = [S[0], S[1] - 0.09];
    return {
      split: true,
      S, E, W, H, K_F: kneeFront, K_B: kneeBack, A_F: F, A_B: B, N,
      knee, depthReached: knee <= 115 || (v === 1 && knee <= 125)
    };
  }

  if (exKey === 'plank') {
    const isKnees = v === 1;
    const S = [0.24, 0.62];
    const A = isKnees ? [0.66, 0.78] : [0.82, 0.78];
    const sag = mode === 'bad' ? (Math.sin(t * Math.PI * 4) > 0 ? 0.09 : -0.09) : 0;
    const H = [(S[0] + A[0]) / 2, (S[1] + A[1]) / 2 + sag];
    const K = isKnees ? A : [(H[0] + A[0]) / 2, (H[1] + A[1]) / 2];
    const E = [0.24, 0.76], W = [0.32, 0.82];
    const N = [S[0] - 0.08, S[1] - 0.02];
    return { S, E, W, H, K, A, N, isKnees, depthReached: sag === 0 };
  }

  if (exKey === 'wallsit') {
    const knee = v === 1 ? 125 : (mode === 'bad' ? 135 : 92);
    const A = [0.55, 0.88], K = [0.55, 0.68];
    const rad = ((180 - knee) / 2) * DEG;
    const H = [0.38, K[1] - 0.04];
    const S = [H[0], H[1] - 0.3];
    const E = [S[0] + 0.05, S[1] + 0.12];
    const W = [S[0] + 0.12, S[1] + 0.22];
    const N = [S[0], S[1] - 0.09];
    return { S, E, W, H, K, A, N, knee, isWall: true, depthReached: knee <= 100 || (v === 1 && knee <= 130) };
  }

  return null;
}

export function startGuideCanvas(canvas, exKey, variant = 0, mode = 'good') {
  const ctx = canvas.getContext('2d');
  let animId = null;
  let startTime = performance.now();
  const period = exKey === 'jack' ? 1600 : exKey === 'plank' || exKey === 'wallsit' ? 3000 : 2400;

  function render() {
    const now = performance.now();
    const cycleT = ((now - startTime) % period) / period;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark sleek container background
    ctx.fillStyle = '#11151f';
    ctx.fillRect(0, 0, w, h);

    // Floor line
    const floorY = h * 0.88;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.06, floorY);
    ctx.lineTo(w * 0.94, floorY);
    ctx.stroke();

    // Wall line for wall sit
    if (exKey === 'wallsit') {
      ctx.strokeStyle = 'rgba(154, 164, 184, 0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(w * 0.36, h * 0.15);
      ctx.lineTo(w * 0.36, floorY);
      ctx.stroke();

      // Wall hatch marks
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(154, 164, 184, 0.2)';
      for (let y = h * 0.18; y < floorY; y += 18) {
        ctx.beginPath();
        ctx.moveTo(w * 0.36, y);
        ctx.lineTo(w * 0.30, y + 14);
        ctx.stroke();
      }
    }

    // Chair outline for chair squats
    if (exKey === 'squat' && variant === 1) {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      // Chair seat & legs
      ctx.strokeRect(w * 0.22, floorY - 60, 48, 60);
      ctx.beginPath();
      ctx.moveTo(w * 0.22, floorY - 60);
      ctx.lineTo(w * 0.22, floorY - 120); // Chair back
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Chair/bar support for supported split squats
    if (exKey === 'lunge' && variant === 1) {
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(w * 0.32, floorY);
      ctx.lineTo(w * 0.32, floorY - 110);
      ctx.lineTo(w * 0.38, floorY - 110);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const p = computePose(exKey, variant, cycleT, mode);
    if (!p) return;

    const mainColor = mode === 'bad' ? '#ef4444' : p.depthReached ? '#22c55e' : '#38bdf8';
    const jointColor = mode === 'bad' ? '#fca5a5' : p.depthReached ? '#86efac' : '#bae6fd';

    function pt(norm) {
      return [norm[0] * w, norm[1] * h];
    }

    function line(p1, p2, width = 6, color = mainColor) {
      const a = pt(p1), b = pt(p2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }

    function node(p1, radius = 5, color = jointColor) {
      const a = pt(p1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(a[0], a[1], radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Skeleton
    if (p.front) {
      // Front View (Jumping jacks)
      line(p.S_L, p.S_R, 6);
      line(p.S_L, p.H_L, 7);
      line(p.S_R, p.H_R, 7);
      line(p.H_L, p.H_R, 6);

      // Arms
      line(p.S_L, p.E_L, 5);
      line(p.E_L, p.W_L, 5);
      line(p.S_R, p.E_R, 5);
      line(p.E_R, p.W_R, 5);

      // Legs
      line(p.H_L, p.K_L, 6);
      line(p.K_L, p.A_L, 6);
      line(p.H_R, p.K_R, 6);
      line(p.K_R, p.A_R, 6);

      // Nodes
      [p.S_L, p.S_R, p.E_L, p.E_R, p.W_L, p.W_R, p.H_L, p.H_R, p.K_L, p.K_R, p.A_L, p.A_R].forEach((x) => node(x));

      // Head
      const hPt = pt(p.N);
      ctx.fillStyle = jointColor;
      ctx.beginPath();
      ctx.arc(hPt[0], hPt[1], 16, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.split) {
      // Split Stance (Lunges)
      line(p.S, p.H, 7);
      line(p.S, p.E, 5);
      line(p.E, p.W, 5);

      // Front & Back Legs
      line(p.H, p.K_F, 6, mainColor);
      line(p.K_F, p.A_F, 6, mainColor);
      line(p.H, p.K_B, 5, 'rgba(154, 164, 184, 0.7)');
      line(p.K_B, p.A_B, 5, 'rgba(154, 164, 184, 0.7)');

      [p.S, p.E, p.W, p.H, p.K_F, p.A_F, p.K_B, p.A_B].forEach((x) => node(x));

      // Head
      const hPt = pt(p.N);
      ctx.fillStyle = jointColor;
      ctx.beginPath();
      ctx.arc(hPt[0], hPt[1], 15, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Standard Side View (Squats, Push-ups, Plank, Wall sit)
      line(p.S, p.H, 7);
      line(p.S, p.E, 5);
      line(p.E, p.W, 5);
      line(p.H, p.K, 6);
      line(p.K, p.A, 6);

      [p.S, p.E, p.W, p.H, p.K, p.A].forEach((x) => node(x));

      // Head
      const hPt = pt(p.N);
      ctx.fillStyle = jointColor;
      ctx.beginPath();
      ctx.arc(hPt[0], hPt[1], 15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Badge Overlay in Canvas
    const statusText = mode === 'bad'
      ? '❌ REJECTED (Shallow / Sag)'
      : p.depthReached
        ? '✅ FULL REP REACHED'
        : '⬇️ MOVING THROUGH RANGE';
    const statusColor = mode === 'bad' ? '#ef4444' : p.depthReached ? '#22c55e' : '#38bdf8';

    ctx.fillStyle = 'rgba(12, 14, 20, 0.85)';
    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(14, 14, 180, 28, 8);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillStyle = statusColor;
    ctx.fillText(statusText, 24, 32);

    animId = requestAnimationFrame(render);
  }

  animId = requestAnimationFrame(render);

  return {
    stop() {
      if (animId) cancelAnimationFrame(animId);
    },
  };
}

// ---------------- Bottom Sheet Guide UI ----------------
export function openExerciseGuide(exKey, initialVariant = 0) {
  const g = EXERCISE_GUIDES[exKey];
  const ex = EXERCISES[exKey];
  if (!g || !ex) return;

  let currentVariant = initialVariant;
  let currentMode = 'good'; // 'good' or 'bad'
  let anim = null;

  function buildContent() {
    const data = currentVariant === 1 ? g.lowImpact : g.standard;
    return `
      <div class="guide-modal">
        <div class="guide-header">
          <div class="guide-title-row">
            <span class="guide-emoji">${g.emoji}</span>
            <div>
              <h2>${esc(data.name)} Guide</h2>
              <p class="sub">${esc(ex.variants[currentVariant])} · Form & Camera Instructions</p>
            </div>
          </div>
        </div>

        <div class="seg-toggle" role="radiogroup" aria-label="Variant selector">
          <button role="radio" aria-checked="${currentVariant === 0}" data-v="0">
            💪 Standard<small>${esc(ex.variants[0])}</small>
          </button>
          <button role="radio" aria-checked="${currentVariant === 1}" data-v="1">
            🌱 Low-impact<small>${esc(ex.variants[1])}</small>
          </button>
        </div>

        <!-- Animated Demonstration Player -->
        <div class="guide-player-card">
          <div class="player-top-bar">
            <span class="player-label">Visual Motion Loop</span>
            <div class="mode-toggles">
              <button class="mode-btn ${currentMode === 'good' ? 'active ok' : ''}" data-mode="good">Full Rep ✓</button>
              <button class="mode-btn ${currentMode === 'bad' ? 'active bad' : ''}" data-mode="bad">Half Rep ✗</button>
            </div>
          </div>
          <div class="guide-canvas-wrap">
            <canvas id="guideCanvas" width="400" height="250"></canvas>
          </div>
          <div class="target-depth-pill">
            🎯 <b>Target AI Rule:</b> ${esc(data.target)}
          </div>
        </div>

        <!-- Camera Placement Section -->
        <section class="guide-sec camera-sec">
          <h3>${g.camera.icon} Camera Setup & Angle</h3>
          <div class="camera-info-grid">
            <div class="cam-badge"><b>Angle:</b> ${esc(g.camera.view)}</div>
            <div class="cam-badge"><b>Distance:</b> ${esc(g.camera.distance)}</div>
          </div>
          <p class="cam-desc">${esc(g.camera.placement)}</p>
        </section>

        <!-- What Counts vs What Gets Rejected -->
        <section class="guide-sec rules-sec">
          <div class="rule-box good">
            <h4>✅ What Counts (Valid Reps)</h4>
            <ul>
              ${data.whatCounts.map((item) => `<li>${esc(item)}</li>`).join('')}
            </ul>
          </div>
          <div class="rule-box bad">
            <h4>❌ What Gets Rejected (Ignored by AI)</h4>
            <ul>
              ${data.rejections.map((item) => `<li>${esc(item)}</li>`).join('')}
            </ul>
          </div>
        </section>

        <!-- Form Tips -->
        <section class="guide-sec tips-sec">
          <h4>💡 Form Pro-Tips</h4>
          <ul>
            ${data.tips.map((item) => `<li>${esc(item)}</li>`).join('')}
          </ul>
        </section>

        <button class="btn primary xl" data-ready-btn>Got it, I'm Ready! ▶</button>
      </div>
    `;
  }

  const sh = sheet(buildContent(), {
    wide: true,
    onClose: () => {
      if (anim) anim.stop();
    },
  });

  function attachListeners() {
    const canvas = $('#guideCanvas', sh.el);
    if (canvas) {
      if (anim) anim.stop();
      anim = startGuideCanvas(canvas, exKey, currentVariant, currentMode);
    }

    // Variant selector
    $$('.seg-toggle button', sh.el).forEach((b) => {
      b.onclick = () => {
        currentVariant = Number(b.dataset.v);
        refreshModal();
      };
    });

    // Good vs Bad mode toggles
    $$('.mode-btn', sh.el).forEach((b) => {
      b.onclick = () => {
        currentMode = b.dataset.mode;
        refreshModal();
      };
    });

    // Close on ready button
    const readyBtn = $('[data-ready-btn]', sh.el);
    if (readyBtn) readyBtn.onclick = () => sh.close();
  }

  function refreshModal() {
    sh.el.querySelector('.guide-modal').outerHTML = buildContent();
    attachListeners();
  }

  attachListeners();
}
