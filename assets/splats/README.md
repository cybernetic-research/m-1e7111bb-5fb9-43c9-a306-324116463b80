# Gaussian splats (3D scans)

The scans here were exported from Scaniverse as `.ply` and converted with
`python3 tools/ply_to_splat.py in.ply out.splat --max 400000 --radius 70 --maxscale 2`
(keeps the 400,000 most significant splats within 70 m of where the scan started, drops the huge sky/background
blobs, and stores 32 bytes per splat instead of 248).

Each site's scans are listed in `<site>.json` (and the site in `index.json`):
`name, file, lat, lon` (where the scan was started), `heading` (degrees clockwise), `alt` (metres OD of the scan's
origin, about 1.5 m above the ground: the phone), `up` (`-y` for Scaniverse), `scale` (1 = metres).

`python3 tools/align_splat.py <site>` fits heading, position and height to the LIDAR surface model. It works where
the scan has buildings or tall shapes (Thornbury Castle 1 and 2); flat beaches and downs don't give it enough to
grip, so those keep the given position with height set from the ground, and their heading is set by eye in the
headset: stand in the scan (☰ MENU → BY PLACE → ✦ 3D scan), press ADJUST SCAN on the waist menu, then left stick
slides it, right stick turns (left/right) and raises/lowers (up/down) it; press ADJUST SCAN again to finish. The
result is kept in that browser and printed to the console (`[scan] ...`) to copy into the JSON. On screen: P starts
and finishes, I/J/K/L slide, U/O turn, Y/H raise/lower.

Within 40 m of a scan's origin the app hides its own box buildings and trees, so the scan shows the real thing.
