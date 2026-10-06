# NERIDA · lossless web delivery

The site opens Version 1 (Original Residence). Version 2 (Atelier) loads only when selected. Both versions and their original render galleries remain available.

- Model delivery uses reversible gzip where useful. Decompressed GLB and navigation bytes match their original SHA-256 hashes.
- Predecoded GI reproduces every bit of the existing Three.js HalfFloat RGBA texture data. Resolution, shader inputs, lighting and rendering quality settings are preserved. The original EXRs remain available as fallbacks.
- Compressed parts are fetched with a maximum of three concurrent requests. GI decoding runs in a module Worker.
- Cache API entries use immutable, content-addressed URLs. Storage failure or eviction falls back to fetching assets; caching is not guaranteed on every device.
- Screen-sized lossless WebP images are UI previews. Gallery links still open the unmodified original high-resolution Cycles PNGs.
- The inactive version pauses further asset requests and animation rendering. Its loaded scene is retained for comparison.

V1 source SHA-256: `9f9bb0d152263453a6901df381b61b87ede4709e8891b2b6e6dd1f8a984b312c`

V2 source SHA-256: `061585f4175469f69ba79c24e31ea9e0f7be28ae7150668c464c3188fb02f464`

Original V2 assets: commit `498824bf5abcabccbc59be5a11837864eb015c6e`, directory `_assets-v2`.

Lossless delivery assets: commit `3f9128e758c16e677c334c8591550fe87fc333ae`, directory `_delivery` on the `v2-assets` branch. Both delivery profiles pin this commit; existing originals are preserved.

364 original day/night lightmaps were compared with their original runtime pixels. 363 use the predecoded delivery format and one retains its EXR. V2 model transfer falls from 722,840,592 to 436,046,164 bytes; V1 model size is almost unchanged because its geometry was already compressed.

First-time full 3D still requires downloading, parsing, GPU uploads and shader/reflection preparation. These file-size improvements are not a measured promise of zero loading time or a specific speedup on all devices.
