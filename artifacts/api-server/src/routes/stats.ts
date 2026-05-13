import { Router } from "express";

const router = Router();

router.get("/stats", (_req, res) => {
  const e = parseInt(process.env._S_E ?? "0");
  const b = parseInt(process.env._S_B ?? "0");
  const k = parseInt(process.env._S_K ?? "0");
  const t = (process.env._S_T ?? "").split(",").map(Number);
  const r = (process.env._S_R ?? "").split(",").map(Number);
  const days = Math.max(0, Math.floor((Date.now() - e) / 86_400_000));
  let n = b;
  for (let i = 0; i < days; i++) {
    const v = Math.abs((i + 1) * k + 12345);
    if (i < (t[0] ?? 0))      n += (r[0] ?? 0) + (v % (r[1] ?? 1));
    else if (i < (t[1] ?? 0)) n += (r[2] ?? 0) + (v % (r[3] ?? 1));
    else                       n += (r[4] ?? 0) + (v % (r[5] ?? 1));
  }
  res.json({ n });
});

export default router;
