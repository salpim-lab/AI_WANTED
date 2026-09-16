# Island model credits

All models come from [Poly Pizza](https://poly.pizza) and are by **Quaternius**,
released under **CC0 1.0** (public domain, no attribution required; recorded
here for provenance). Licence: https://creativecommons.org/publicdomain/zero/1.0/

Processing (Blender 5.2): parts joined into one mesh, material base colours baked
into a vertex colour attribute (`COLOR_0`), materials removed, decimated where
noted, origin moved to the base centre with the front toward −Y (three.js +Z),
exported as GLB with `EXT_meshopt_compression`. Atlas/texture-coloured sources
(rocks, stairs) were recoloured by face direction. Colours were warmed slightly
to match the island palette. No textures are shipped.

| File | Source model | Poly Pizza | Licence | Changes |
| --- | --- | --- | --- | --- |
| `house-0.glb` | House | https://poly.pizza/m/vZ1CLbWmSx | CC0 1.0 | 2716 → 1399 tris, walls recoloured cream |
| `house-1.glb` | House | https://poly.pizza/m/oJJIRwv6Bo | CC0 1.0 | 2336 → 1200 tris, walls recoloured cream |
| `house-2.glb` | House | https://poly.pizza/m/L7h0SjZX2K | CC0 1.0 | 1028 → 800 tris |
| `broadleaf-0.glb` | Tree | https://poly.pizza/m/b0boebSV1r | CC0 1.0 | 1044 → 420 tris, brighter leaves |
| `broadleaf-1.glb` | Tree | https://poly.pizza/m/i4QMw4L64D | CC0 1.0 | 2412 → 449 tris, brighter leaves |
| `conifer-0/1/2.glb` | Pine Trees (single trees split from the group) | https://poly.pizza/m/oYtDty0fR6 | CC0 1.0 | 345–399 tris each, three needle colours |
| `bush-0.glb` | Bush with Berries | https://poly.pizza/m/TSbIxkDtxF | CC0 1.0 | 795 → 443 tris (⅓ of berries kept) |
| `boulder-0.glb` | Rock Large | https://poly.pizza/m/li0YBlBEMz | CC0 1.0 | recoloured by facing, moss on flat tops |
| `boulder-1.glb` | Rock Large | https://poly.pizza/m/54jZKTAt5p | CC0 1.0 | recoloured by facing, moss on flat tops |
| `boulder-2.glb` | Rock Medium | https://poly.pizza/m/s1OJ3bBzqc | CC0 1.0 | recoloured by facing |
| `stone-0.glb` | Rock | https://poly.pizza/m/4MUaQTcDdc | CC0 1.0 | recoloured by facing |
| `fence-0.glb` | Fence | https://poly.pizza/m/e02PFKKhbr | CC0 1.0 | lighter wood |
| `bridge-0.glb` | Small Bridge | https://poly.pizza/m/j4KsIuJYnq | CC0 1.0 | 2880 → 1399 tris, turned to run along +Z |
| `stairs-0.glb` | Stairs | https://poly.pizza/m/Rh9shsu2hx | CC0 1.0 | wood colours by facing |

Poly Haven textures were not used: the island style is flat-shaded vertex colour
only (`islandTerrain.ts`, `rockCliff.ts`).

`src/components/student/island/islandAssets.ts` maps these files to prop keys,
loads each file once, and fits it to the procedural model's box so the layout
plan's footprints stay valid. Missing files fall back to the procedural models.
