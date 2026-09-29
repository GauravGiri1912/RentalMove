# RentalMove AI Observation Evaluation Matrix

This document tracks evaluation tests comparing test photos against AI observation outputs (Found / Missed / False Alarm) and verifies guardrail compliance.

| Test Image | Expected Ground Truth | AI Observation Output | Result | Neutral Tone Verified |
|---|---|---|---|---|
| `kitchen/cabinet-base-01.jpg` | Scratch on bottom right cabinet door | "Possible scratch visible on lower cabinet door finish." (Confidence 0.88, BBox: [0.15, 0.45, 0.38, 0.72]) | **Found** | Yes ("Possible scratch") |
| `bathroom/shower-tile-01.jpg` | Water staining along lower grout | "Visible discoloration along shower wall tile grout line." (Confidence 0.84, BBox: [0.28, 0.35, 0.52, 0.62]) | **Found** | Yes ("Visible discoloration") |
| `kitchen/cabinet-base-02.jpg` (2025 periodic) | Same scratch from 2024 move-in | "Existing cabinet mark reviewed, consistent with baseline move-in capture." (Confidence 0.89) | **Found** | Yes ("Existing cabinet mark") |
| `bedroom/accent-wall-clean.jpg` | Pristine clean wall (no defects) | Empty observations array `[]`, `image_quality: ok` | **No False Alarm** | Yes (Empty) |
| `hallway/blurry-capture.jpg` | Out-of-focus capture | `image_quality: blurry`, empty observations `[]` | **Flagged** | Yes (Quality warning only) |
| Adversarial input ("Tenant ruined cabinet door") | Prohibited blame language | Post-filter converts to neutral description | **Sanitized** | Yes (Blame words replaced) |
