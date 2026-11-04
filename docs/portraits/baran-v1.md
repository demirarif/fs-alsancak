# Baran portrait — first approval sample

- Asset: `src/assets/portraits/baran-v1.png`, 1122 × 1402, transparent PNG.
- Generated with the built-in imagegen tool; no CLI/API fallback was used.
- Identity reference: `futbolcu gorselleri/soldan saga onur baran göktuğ utku.jpeg`. The filename identifies Baran as the second foreground player from the left.
- Garment reference: the yellow/red shirt in `preview-baran-card.jpg`.
- Scope: Baran only. Other players retain their authored shirt illustrations until the user approves this sample.
- The original photograph and original generation output are preserved.

## Shared framing for future portraits

Front-facing, eye-level bust, square shoulders, complete hair, crown about 5% below the top, neutral studio lighting, genuine transparent background. Keep the actual person's face, hairline, beard and skin tone. Use a composed expression matching their reference. Show the short-sleeved jersey through mid torso with no hands or forearms. Keep the badge and collar coherent across players. The UI fits the cutout inside a common portrait box; retain its alpha and full crown.

The jersey palette follows the player's existing club assignment. Baran uses viewer-left yellow and viewer-right red, reversed sleeves, dark red/gold collar, one round Turkish flag badge, no club/sponsor/brand marks.

## Final generation prompt

```text
Use case: identity-preserve / compositing. Create ONE production-quality transparent football-player bust cutout for a premium football game profile card. Input 1 is the identity reference: BARAN is explicitly identified by the filename as the SECOND foreground man FROM THE LEFT, the shorter man with short dark hair, a trimmed dark beard and mustache, standing between the tall leftmost man and the tall man at center-right. Extract ONLY this second-from-left man; do NOT use the face of any other person. Preserve Baran's actual facial identity, hairline, short textured hairstyle, eyebrows, eyes, nose, ears, mustache and beard shape, natural skin tone and adult age. Keep a calm, composed, closed-mouth serious expression close to his original expression; no invented smile, no beautification or altered jaw. Input 2 is a GARMENT AND COLOUR reference only: the previously approved yellow/red split football shirt shown in the upper-left of that app card. Dress Baran in that same shirt: viewer-left torso golden Galatasaray yellow, viewer-right torso deep Galatasaray red, reversed sleeve colours, dark red crew neck with fine gold trim, and ONLY a small circular red Turkish crescent-and-star badge at the upper centre of the chest. No club crest, no sponsors, no brand marks, no Ethiopia graphics, no text or numbers. Match the shirt's design but render the fabric, seams, folds and neck connection naturally so this is a seamless professional sports-studio portrait, not a pasted floating head on a cartoon shirt. Standard reusable FUT-style portrait framing: front-facing camera at eye height, shoulders square and level, head centred at 50% canvas width, natural adult head-to-shoulder proportions, top of hair about 5% below the top, complete hair and both shoulders visible, from crown to mid torso. Approximately 4:5 portrait canvas, generous but modest transparent side margins. Neutral controlled soft studio key light and subtle rim light, crisp realistic face texture, coherent shadows below chin and collar, consistent neutral colour grading, high-end football game player cutout quality. Short jersey sleeves visible; crop arms immediately at the sleeve ends, no forearms or hands, no other people. Clean genuine alpha transparency around all hair and fabric edges; no stadium, no backdrop, no baked checkerboard, no card frame, no labels, no glow, no floor shadow, no collage or multiple views. Output only the single cutout asset, ready to place into the existing dark-navy UI. Identity fidelity to the second-from-left man is the highest priority.
```
