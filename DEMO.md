# Recording the 2-minute demo

Rehearsed end to end by `node scripts/demo-walkthrough.mjs` (7/7 beats pass; screenshots of every beat in
`.e2e/demo-walkthrough/`). Record at **1440 × 900** in a clean browser window, logged out.

**The one line to say first:** *"At move-out the landlord says the damage is yours. RentalMove proves it was already there."*

**The climax is the landlord-claim screen** (`/claim`, signed in as **Alex Chen, the demo tenant**). Everything before it sets it up; everything after it is proof.

| Time | Open | Do | Say |
|---|---|---|---|
| 0:00 - 0:12 | `/welcome` | Nothing. Let the before/after slider sit. | "Every year renters lose deposits over damage that was already there. It is their word against the landlord's." |
| 0:12 - 0:30 | `/kit` | Scroll to the room counters. Do not start a kit. | "On move-in day the tenant photographs each room from a guided shot list. No account. Every photo is fingerprinted on the phone and the record is sealed." |
| 0:30 - 1:20 | Log in as **Alex Chen**, click the **"Your landlord says you broke something?"** card, tap the first example (or paste it) | Press **Check the record**. Scroll slowly through the result. | "Two years later the landlord messages: *shower glass is damaged, 4,000 rupees off your deposit.* The tenant pastes it in. RentalMove finds that exact spot in the move-in photo. **Already there at move-in, 1 June 2024.** Same stain, not larger. And here is a polite reply, ready to send." |
| 1:20 - 1:35 | Same screen | Tap **Add a link to the sealed record**, then **Cancel the link** | "The reply can carry a read-only link to the sealed record. The tenant can cancel it any time." |
| 1:35 - 1:50 | `/verify` | Drop `demo-assets/kitchen-move-out-ORIGINAL.jpg`, then `kitchen-move-out-EDITED.jpg` | "And nobody can say the photos were edited. The original matches the record; this one, with the damage softened in an editor, has no record. One pixel breaks the fingerprint." |
| 1:50 - 2:00 | `/welcome` | - | "Every room remembers." |

**Say this once, out loud:** *"It also answers honestly. If the damage is new, it says so."* Two measured examples on the demo data: **"Kitchen worktop is burnt, Rs 5000"** answers *"RentalMove found nothing matching in either photo"* (it does not invent a finding), and **"Living room wall has marks, Rs 3500"** answers *"No usable move-in photo of the living room"* (that move-in photo was flagged as a different room and left out, and the page says exactly that). A claim about a *kind* of damage must match that kind: **"Bathroom floor has a crack"** will not be waved through because of an unrelated stain.

## Avoid on camera
- **Anything that makes the claim screen start late.** It is the climax; do not spend the time elsewhere.
- **Media lab, Re-let studio, Home map** — good features, but they dilute the story in two minutes.
- **Living Room page play button** — that room has only one usable photo, so the time-lapse is greyed out. Use **Kitchen** or **Bathroom** if you show it.
- **Signing up a new account on camera** — it needs a real inbox and the confirmation click, which takes time. Use the demo logins.

## If something goes wrong while recording
- Blank or unstyled page: stop the dev server, delete the `.next` folder, run `npm run dev` again.
- The first load of each page in dev mode takes several seconds. Open each URL once before recording.
