# Repdle launch kit

*Draft, 22 Oct 2026. Nothing here has been posted. The live link is https://repdle.repdle.workers.dev (deployed 23 Oct 2026).*

---

## 1. YouTube long video (Hindi, faceless, Jitendra Builds style)

**Title options** (keyword first, under 60 characters):
1. `Maine ₹0 me fitness ka Wordle banaya, aap mujhe hara sakte ho?`
2. `₹0 App: Fitness ka Wordle | AI aapke reps ginta hai`
3. `Claude Code se ₹0 me viral app banaya (Repdle)`

**Format:** faceless explainer, the usual house style. That means narration in Devanagari via `hi-IN-MadhurNeural` at +18%, Devanagari captions, the photo badge bottom-right and Pixabay music from `music/`.
- Brand names in the TTS text: Repdle → "रेपडल", Wordle → "वर्डल", Cloudflare → "क्लाउडफ्लेयर", MediaPipe → "मीडियापाइप".
- Length: 9–11 minutes.

**Main CTA throughout:** "Description me link hai. Aaj ka challenge karo aur apna grid comment me paste karo. Mera score beat karke dikhao."

| # | Time | Section | Narration beats (Hinglish summary; the TTS text is in Devanagari) | Visuals |
|---|---|---|---|---|
| 1 | 0:00–0:30 | **Hook** | "Ye 6 squares dekho: 🟩🟩🟩🟩🟨🟥. Ye mera aaj ka fitness score hai, aur ye app maine ₹0 me banaya. Camera ka AI mere squats ginta hai, aur half rep count hi nahi karta. Aaj ka challenge poori duniya ke liye same hai. Video ke end tak mujhe hara ke dikhao." | Phone screen: share grid → result screen → skeleton overlay counting a rep (skeleton-only view for faceless). Big text: "₹0 · AI · Poori duniya" |
| 2 | 0:30–1:30 | **Problem** | WHO says 1.8 billion adults (31%) don't move enough, and by 2030 that will be 35%. Everyone says "time nahi hai". Gym apps are long and boring, and nobody finishes a 30-day program. | WHO stat card with the tag "स्रोत: WHO, 2024". Stock-style animation of a desk worker (generated or HyperFrames). |
| 3 | 1:30–2:30 | **Insight: Wordle** | Wordle grew from 90 players to 3 lakh+ in about 2.5 months, and the reason was those emoji squares. One puzzle a day, the same for everyone, and you can share your result without spoiling it. "Agar yahi formula fitness pe lagaun?" | Wordle growth chart (source: NBC/TechCrunch), Wordle-style tiles morphing into R-E-P-D-L-E |
| 4 | 2:30–3:30 | **What Repdle is** | Every day there's one 60-second challenge: squats, push-ups, jumping jacks, lunges, plank or wall sit. You get a 6-square pace grid (🟩 kept pace, 🟨 slowed, 🟥 stopped), your world percentile, your country rank, a streak, a duel link, leagues and country battles. | App walkthrough: home → start → result → share preview |
| 5 | 3:30–5:00 | **The AI part (wow)** | MediaPipe pose AI runs inside the browser and tracks 33 body points. It measures the knee angle: below 100° counts as a full squat, and a shallow one shows "Go lower" and isn't counted. "Video kabhi phone se bahar nahi jaata." Also the push-up trick: bending your elbows while standing doesn't count, because your body has to be horizontal. | Screen capture of the skeleton with the angle overlay; a split-screen of a half rep (✗) vs a full rep (✓); the privacy badge |
| 6 | 5:00–6:30 | **Built with Claude Code** | How it was built: a prompt, then the plan, then the code. The front end is plain JS, the backend is a Cloudflare Worker with D1, and there are 28 unit tests + 15 API tests + a real Chrome camera test (plus a real webcam test: 24 squats counted). "Main Flutter dev hoon, par isme ek line Flutter nahi." | Claude Code terminal timelapse, test output (✔ 28 pass), the file tree |
| 7 | 6:30–8:00 | **₹0 math** | Cloudflare's free tier gives 100K requests/day, 100K D1 writes and 5M reads. One player is about 1 request. So ~50K players a day still costs ₹0. Old scores are dropped each month with one DROP TABLE, which counts as 0 writes. "Play Store ki ₹2,100 fee bhi abhi nahi, kyunki ye website hai. iPhone wale bhi Safari se khel sakte hain." | Simple bar graphics: 89K/100K requests, 78K/100K writes, 3.4M/5M reads (numbers from the README) |
| 8 | 8:00–9:00 | **Safety + honesty** | It's 18+, it's a game and not medical advice, every day has a low-impact option, and you stop if anything hurts. "Ye viral hoga ya nahi, mujhe nahi pata. 30 din ka test hai: share rate 15%, D7 20%, duel accept 25%. Results next video me." | Safety screen, the metrics plan card |
| 9 | 9:00–9:40 | **Challenge + CTA** | "Mera aaj ka score X hai, ye raha duel link. Beat karo aur comment me grid daalo. Office/college ki league banao. India ko country battle me upar le chalo! 🇮🇳" | Your real share grid, duel page, country battle screen. End screen. |

**Upload pack (to do):**
- Description: link, what it is, a privacy line ("video never leaves your phone"), a safety line (18+, stop if pain), and "Built with Claude Code" (AI disclosure). Chapters from the table.
- Pinned comment: today's grid + duel link.
- Tags: fitness wordle, daily fitness challenge, ai rep counter, claude code, cloudflare workers free, ₹0 app, web app.
- Thumbnails A/B:
  - (A) a big 🟩🟩🟩🟩🟨🟥 grid + "₹0 APP" + a skeleton figure;
  - (B) "AI ne mere squats gine 😳" + phone mockup.
- Before you publish:
  - the app is deployed and works on your own Android + iPhone;
  - `https://repdle.repdle.workers.dev` is replaced everywhere;
  - the contact email is in the privacy section;
  - challenges are regenerated with the launch date.

> Faceless tip: the app hides the camera picture with **Settings → Skeleton-only view**, so you can record real reps without showing your face or body.

---

## 2. Reels / Shorts shot list (9:16, 15–30 s each)

All of these are faceless-friendly: use skeleton-only view, a side silhouette, or a screen recording. **Hook in the first 1.5 s.** End every one with "Link in bio: aaj ka challenge".

| # | Hook (on-screen text) | Shots | Audio |
|---|---|---|---|
| 1 | "AI ne mere half reps reject kar diye 😤" | (1) phone on the floor, skeleton view, 2 half squats with "Go lower ⬇️" and count still 0; (2) 3 full squats, count 1-2-3 with a beep each; (3) result grid | App beeps + trending beat |
| 2 | "Ye Wordle hai… par fitness ka" | (1) WhatsApp chat with a friend's grid message; (2) tap the link → duel page "Ravi challenges you"; (3) 60-s timelapse; (4) "You beat Ravi! 🏆" | Voice-over: "Dost ne challenge bheja…" |
| 3 | "India vs Brazil: aaj ka fitness war 🇮🇳🇧🇷" | Country battle bars, the countries table, "India #2, help karo" | Dramatic sting |
| 4 | "₹0 me app chal raha hai, kaise?" | Cloudflare free-tier numbers as 3 quick cards, then "50,000 players/day = ₹0" | VO, fast cuts |
| 5 | "Claude Code ne 1 din me poora app banaya" | Terminal timelapse, tests passing (✔), then the app on the phone | Lo-fi beat |
| 6 | "Office ki league banayi, boss last aaya 😂" | League board screenshot with funny nicknames (use demo data, not real colleagues without permission) | Comedy sound |
| 7 | "60 second. Roz. Bas." | Six exercises, 1 s each (skeleton only), then the grid | Countdown beeps |
| 8 | "Push-up cheat try kiya… AI ne pakad liya" | Standing arm bends → "Get into push-up position", then a real push-up counts | VO |

Posting rhythm: one Short per day for 14 days, matching that day's exercise. Each caption ends with the grid + `https://repdle.repdle.workers.dev`.

---

## 3. English launch posts (drafts — do not post until the app is live)

### X (Twitter) thread

> **1/** I built "Wordle, but you move" 💪
> One 60-second exercise a day, the same for everyone on Earth. Your phone's camera counts the reps with on-device AI, and half reps don't count.
> Share your grid: 🟩🟩🟩🟩🟨🟥
> Play (no install, no sign-up): https://repdle.repdle.workers.dev
>
> **2/** The grid is your pace per 10 seconds: 🟩 kept pace · 🟨 slowed · 🟥 stopped. It shows effort without spoiling anything.
> Send someone your link and they get a duel against your exact score.
>
> **3/** Privacy: the pose model (MediaPipe) runs in your browser. No video ever leaves your device. The only things sent are a score, a nickname and a country code. No accounts, no cookies, no trackers.
>
> **4/** Built with Claude Code as a ₹0 / $0 experiment: static site + one Cloudflare Worker + D1, all on the free tier. The design math says ~50K players a day still fits.
>
> **5/** Today's challenge is <exercise>. My score is <N>. Beat me → <duel link>
> There's a low-impact option every day. 18+, and stop if anything hurts.

### Reddit — r/SideProject (also fits r/webdev "Showoff Saturday"; read each sub's self-promo rules first)

**Title:** I made a daily 60-second fitness challenge where your camera counts reps on-device ("Wordle, but you move"). Free, no sign-up.

**Body:**
> Hi! Repdle is one bodyweight challenge per day (squats, push-ups, jumping jacks, lunges, plank, wall sit). It's the same challenge worldwide and resets at 00:00 UTC.
>
> - **Counting:** MediaPipe Pose runs in the browser. Reps count only through the full range, measured by joint angles. Half reps get a "Go lower" and are not counted.
> - **Sharing:** you get a spoiler-free pace grid (🟩🟨🟥 per 10 s), a world percentile, a country rank, duel links, private leagues and country battles.
> - **Privacy:** video never leaves your device, and I don't use accounts, cookies or third-party scripts.
> - **Stack:** vanilla JS, a Cloudflare Worker + D1 on the free tier (static assets are free; one API call per player per day), and self-hosted MediaPipe WASM.
> - **Fallback:** if your camera or phone can't run the model, there's a tap mode, but it's unranked.
>
> What I'd love feedback on: does the counting feel fair on your phone? Is the grid something you'd actually share?
>
> https://repdle.repdle.workers.dev
>
> (18+. Every day has a low-impact variant. Stop if anything hurts.)

### Reddit — r/bodyweightfitness

Their rules on self-promotion are strict. Only post if the rules allow it (for example in the daily thread), and frame it as a request for feedback on form thresholds: "squat counts below 100° knee angle, push-ups below 100° elbow angle with a straight body. Are those fair cut-offs?"

---

## 4. Launch-day checklist

- [ ] `npm run gen:challenges -- --start <launch date>` so that #1 is launch day (squats)
- [ ] Deploy (README → "Deploy for ₹0"), then play once on Android Chrome **and** iPhone Safari
- [ ] Contact email in About → Privacy; absolute `og:image` URL in `index.html`
- [ ] Create your own league ("Jitendra Builds Squad") and put its code in the video description
- [ ] Day 1, 3, 7: run `npm run metrics` and note share %, D7 and duel accept % for the follow-up video
