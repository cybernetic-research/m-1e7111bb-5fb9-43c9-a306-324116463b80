// Fine-grained solids for walking (see Features.blockedFine): wall segments in window pixels, each with a half
// thickness in metres. collider(segs, mpp) gives a test (i, j) => true where a point is inside any of them.
export function collider(segs, mpp) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { a, b, half } of segs) {
    const pad = half / mpp + 1;
    box[0] = Math.min(box[0], a[0] - pad, b[0] - pad);
    box[1] = Math.min(box[1], a[1] - pad, b[1] - pad);
    box[2] = Math.max(box[2], a[0] + pad, b[0] + pad);
    box[3] = Math.max(box[3], a[1] + pad, b[1] + pad);
  }
  return (i, j) => {
    if (i < box[0] || j < box[1] || i > box[2] || j > box[3]) return false;
    for (const { a, b, half } of segs) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((i - a[0]) * dx + (j - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(a[0] + dx * t - i, a[1] + dy * t - j) * mpp < half) return true;
    }
    return false;
  };
}
