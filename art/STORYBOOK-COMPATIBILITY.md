# ONE WORD — storybook integration

Project: `/Users/pierres/Hackaton-deepmind-art/one-word`.

## Sources merged

The original Tsaousis base (`3f4f815`) and local illustrated renderer are preserved in checkpoint `ee07f3f`. The integration contains the latest fetched main (`6b3a24e`), mobile (`f3d84d4`) and audio (`e3a7c97`) histories. It includes all twelve chapters, the level maker, AI interpreters, indexed word slots, the one-word limit, mid-level rewrites, and SLIDE / TELEPORT / PUSH / SWAP. Chapter 8 explicitly permits two simultaneous changed words.

No remote branch has been changed or pushed. The rule definitions, world simulation and shipped levels match the fetched main branch.

## Art and motion

- Detailed painted environments and the original manuscript desktop menu remain.
- Three distinct enemies rotate through chapters: brass sentinel, clockwork owl and ink wraith. Each has four registered alert, asleep, helpful and frozen frames. Intent symbols and rings distinguish behavior without recoloring the illustration.
- Atlas files: `public/art/runtime/{sentinel,owl,wraith}-states.png`. Transparent 2048×512 sheets contain four 512px cells. `tools/prepare_enemy_variety.mjs` prepares the owl and wraith source sheet.
- The player holds a stable idle pose, uses two walking contact poses, and follows the grid without squash or overshoot. Movement stays locked through bounce and slide paths.
- Defeat fades into ink and parchment; victory releases gilded paper leaves. Outcomes respect reduced motion and cancel on restart.

## Music

All five music beds (menu, calm, tension, mystery, hope), both outcome stings and nine recorded effects are loaded through one WebAudio graph. Menu, danger, puzzle and victory states choose the appropriate bed. Mute persists on the device. Teleport and push have additional synthesized cues. Background tabs and blocked portrait play suspend audio.

## Progress

- Wanderer is available immediately. Completing chapter 2 unlocks Cartographer; completing chapter 4 unlocks Archivist. Locks appear in the wardrobe and mobile selection. Completion and selection persist locally.
- Accepted rewrites are collected during the current attempt. They enter the permanent word book only on victory, before the completion animation ends. Restart discards unused attempts; a death retains only words still active in the reset rules.
- The right-hand word book shows unlocked words supported by the current chapter, records the chapters where they were used, and opens the appropriate editable slot when clicked. The word editor also offers relevant unlocked words.
- Chapter completion, outfits and words persist. Best times and alternative-solution history remain session-only.

## Mobile and maker

Touch devices must use landscape for gameplay. Portrait shows a rotation instruction, makes the game interface inert and pauses its loop and audio. Landscape restores play. The board retains square tiles; controls sit below it and the word book remains on the right. The word-entry sheet follows the visual viewport. Completion cards scroll within short screens.

The mobile menu uses the same storybook typography and background, with all twelve chapter buttons and visible skin requirements. The original desktop menu remains.

The maker uses the runtime storybook palette. Custom maps keep their symbols and physics; the camera fits larger maps. Authors can set the simultaneous word-change limit, which is saved in drafts and level definitions and respected by the solver. Development saves to the definitions directory; static builds offer a file download.

## Run and validate

```sh
cd /Users/pierres/Hackaton-deepmind-art/one-word
npm run dev -- --host 0.0.0.0
npm run build
npm test
```

Game: `/`. Maker: `/editor.html`. The production build includes both pages and relative asset paths.

Browser regressions from the repository root (set `PLAYWRIGHT_MODULE` if Playwright is not locally installed):

- `tools/review_merged.mjs`: chapter gameplay, new word logic, rewards, enemy states, audio decoding, saved-word reuse and landscape phone layouts.
- `tools/review_progression.mjs`: skin-lock milestones, selected-sprite persistence, actual music playback, all twelve mobile chapter buttons and the three-rule small-screen layout.
- `tools/review_maker.mjs`: paint, solve, save, launch and win a temporary 21-column map; word-limit draft/serialization; touch painting; reduced-motion outcomes. The temporary definition is removed afterward.

Older `review_compatibility.mjs` / `review_storybook.mjs` scripts document earlier six-chapter behavior and are not the current regression entry points.

Browser checks use Chromium desktop and phone emulation. Physical iOS/Android keyboard behavior has not been tested.

## Validation — 26 September 2026

- Production build and bundled-secret check pass.
- Solver suite passes all twelve chapters and their declared solutions, including mid-level rewrites.
- Browser playthrough completes all twelve chapters using the word editor and movement inputs; one-word restoration and the two-word exception pass.
- All sixteen recorded audio files fetch and decode. Menu, calm, tension and mystery beds play; victory requests hope. Mute toggles correctly.
- Three enemy atlases and four behavior frames pass. Outfit locks, milestone notices, rendered selection and reload persistence pass.
- No word unlock before victory; discarded attempts do not add words. Chapter filtering, click-to-reuse and saved collection pass.
- Phone emulation passes portrait blocking/recovery, touch-only victory and layouts at 844×390 and 667×375. A compact horizontal rule header keeps the three-rule chapter's board readable. Rotation screen and enemy screenshots are in the local `art/review/` folder.
- Maker paint/solve/save/play/win, a 21-column map, word-limit draft persistence, touch painting and reduced-motion outcomes pass. Temporary level removed.
- No browser page errors in the regression runs.
