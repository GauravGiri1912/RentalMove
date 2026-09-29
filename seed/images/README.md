# RentalMove Demo Images

This directory holds demo property condition photos for seeded property **#381**.
Photos are organized by inspection year and room category:

```
seed/images/
  2024/
    kitchen/
      cabinet-base-01.jpg
    bathroom/
      shower-tile-01.jpg
  2025/
    kitchen/
      cabinet-base-02.jpg
  2026/
    bathroom/
      shower-tile-02.jpg
    kitchen/
      cabinet-base-03.jpg
```

## Dropping in Real Photos
To drop in real property photos:
1. Place standard `.jpg` files into the matching year and room folders above.
2. Run `npm run seed:demo` (or `npx tsx scripts/seed-demo-assets.ts`).
3. The script calculates SHA-256 hashes, uploads to Cloudinary with structured metadata tags, inserts Supabase database rows, and maps pre-computed analysis from `seed/analysis.json`.
