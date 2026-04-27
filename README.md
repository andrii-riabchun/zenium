# Zenium

Zenium is a Chrome extension that applies calmer, content-focused styles to supported websites.

<img src="https://github.com/andrii-riabchun/zenium/blob/main/assets/img1.png?raw=true"></img>

By default, Zenium downloads style definitions from `https://sameerasw.github.io/my-internet/styles.json`.

## Background Fallback

Zenium can render transparent site shells against either:

- a global solid background color
- a locally uploaded background image layered over that color

Background images support these modes:

- Fill
- Fit
- Center
- Stretch
- Tile

Background images can also be adjusted with:

- tint, using the configured fallback background color
- blur, applied at render time to the page background layer

When a mode leaves parts of the page uncovered, the configured solid background color remains visible underneath.

The popup also includes a per-website toggle for the background image, so the image fallback can be disabled on individual sites while keeping Zenium styling enabled.

Uploaded images are stored locally in Chrome extension storage with their original quality. Tint and blur are applied at render time.

## Credits

Zenium builds on ideas and source material from these projects:

- [sameerasw/zeninternet](https://github.com/sameerasw/zeninternet)
- [sameerasw/my-internet](https://github.com/sameerasw/my-internet)
