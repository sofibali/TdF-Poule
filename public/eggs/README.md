# Rider easter-egg images 🥚

Drop family pictures here (e.g. `uncle-on-a-bike.jpg`), then add a line in
`lib/data/rider-eggs.ts` keyed by a word in the rider's name:

```ts
kruijswijk: { url: "/eggs/uncle-on-a-bike.jpg", label: "Uncle Steven", image: true },
```

`image: true` makes it pop up in a click-to-dismiss lightbox on the page.
Anything in `public/` is served from the site root, so `public/eggs/foo.jpg`
is reachable at `/eggs/foo.jpg`.
