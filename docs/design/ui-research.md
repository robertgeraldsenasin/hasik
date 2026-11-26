# Game UI research for the play page

November 2026. Written for the UI redesign in [ADR-0010](../decisions/ADR-0010-game-ui-redesign.md).

The milestone 1 page was correct and accessible, but it played like a form. The board was a static
picture, the controls were three dropdowns and a checkbox, a second row of buttons under the board
repeated the houses, and the rules lived in a text dialog. The question for this round was narrower
than "make it prettier": can Sungka be fun on a screen at all, and what does the interface have to do
for that to happen?

## What the engine says about pacing

Before reading anything, we measured the game itself: 400 seeded self-play games per policy through
`applyMoveTraced`. `pnpm move-lengths` reproduces the table and writes
[`results/move-lengths.json`](../../results/move-lengths.json).

|                                           | Random vs random | Greedy vs greedy |
| ----------------------------------------- | ---------------- | ---------------- |
| Moves per game (median)                   | 33               | 21               |
| Shells dropped per move (median)          | 6                | 5                |
| Shells dropped per move (90th percentile) | 37               | 48               |
| Longest single move                       | 212              | 137              |
| Moves that relay at least once            | 54%              | 54%              |
| Moves that capture                        | 48%              | 63%              |
| Moves that earn an extra turn             | 27%              | 27%              |

Two things fall out of this table. Games are short, so a session is a handful of minutes, which suits
the web. And the median move is tiny while the tail is enormous. The old page spent a fixed 130 ms per
shell plus a pause for each scoop, so one move in ten took about seven seconds to watch and the longest
took 20 to 30 seconds. Half of all moves relay, which means a player can't count them in their head.
Slow, unpredictable moves are what made the game feel unplayable, not the rules.

## What other games and research say

**Feedback is the game, but only feedback that carries information.** Jonasson and Purho's
[Juice it or lose it](https://www.gdcvault.com/play/1016789/Juice-It-or-Lose) took a plain
block-breaker and made it feel alive with particles, shake, sound and animation without touching the
rules. [Hicks et al. (DiGRA 2018)](https://dl.digra.org/index.php/dl/article/view/936) turned the idea
into a framework from developer interviews. The counterweight: too much amplified feedback makes it hard
to tell which events matter mechanically ([Lin et al., 2022](https://arxiv.org/pdf/2208.06155)). Balatro
is the clearest modern case of a game whose rules are arithmetic and whose feel comes from layering
motion, rising sound and shake, with shake strength [used as a signal for score size](https://blakecrosley.com/guides/design/balatro).

**Show the outcome before the commitment.** Into the Breach telegraphs every enemy action during the
player's turn, and its designers say they [sacrifice cool ideas for clarity every time](https://gamedeveloper.com/design/-i-into-the-breach-i-dev-on-ui-design-sacrifice-cool-ideas-for-the-sake-of-clarity-every-time-).
Sungka is also a game of perfect information that people can't compute, which is the same problem. The
cheapest way to build such a preview is to run the real rules on a copy of the position
([example](https://forum.godotengine.org/t/into-the-breach-style-tactics-in-gdscript-rules-as-events-previews-on-a-cloned-board-and-attacks-that-move-when-pushed/146380)),
which Hasik already did for its text preview.

**Make the opponent's move readable.** A Pico-8 chess project had the AI
[move the cursor to its piece before playing](https://krystman.itch.io/pico-checkmate/devlog/34246/making-chess-for-pico-8-2-juicyness),
moved pieces along arcs with a ground shadow, and warned that slow animation makes a game feel sluggish.
Chess.com's own help pages tell bullet players not to turn piece animation off, because a short
movement is how you notice the [opponent's move](https://www.chess.com/forum/view/help-support/bullet-2-1-cant-see-opponents-moves-or-when-its-my-turn).

**Physical objects should behave physically.** Hearthstone's UI team moved from a flat parchment look
to a [physical one where parts bounce and rotate](https://www.mmo-champion.com/content/4753-Mar-4-Hotfixes-Level-100-Neutral-Pandaren-Hearthstone-at-GDC-Blue-Tweets-NerfNow?p=32597643),
because the fun of handling cards is what a digital card game risks losing. A sungka board has the same
pull: the fun is the hand of shells going round.

**Mancala apps fail on speed and turn clarity.** App store reviews of Mancala+ complain that moves were
[too fast to understand until a speed setting arrived](https://game-solver.com/mancala-2/), and that the
"your turn" indicator was easy to miss. A Chrome store review of another mancala could not work out
[where the bot's capture came from](https://chrome.google.com/webstore/detail/cjlhjhpnhabnfepdfemepiilbjbkecpe).

**Teach by doing, briefly, and let people replay it.** Text-heavy tutorials fail; the advice is to show
rather than tell and [not to frontload](https://www.smashingmagazine.com/2014/04/rethinking-mobile-tutorials-which-patterns-really-work/).
Apple's onboarding guidance adds that players forget, so tutorials should be
[replayable](https://developer-rno.apple.com/app-store/onboarding-for-games/).

**Touch and motion.** Apple asks for 44 × 44 pt targets, Material for 48 × 48 dp, and WCAG 2.2 sets 24 px
as the AA minimum ([summary](https://shopify.dev/docs/storefronts/themes/best-practices/performance/increase-tap-target-size)).
At 390 px wide, the old horizontal board had pits about 30 px across. The Xbox guidelines ask games to
let players [turn off shake and similar motion](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117),
and the Game Accessibility Guidelines list [adjustable game speed](https://gameaccessibilityguidelines.com/basic/) as a basic.

**The thing itself.** In the Philippines the small pits are _bahay_ (house) and the stores _ulo_ (head);
the counters are cowries, _sigay_; the board, _sungkaan_, is often
[carved in the shape of a boat](https://pinoy-culture.com/traditional-philippine-games-sungka-sungk-is-a/)
([Mancala World](https://mancala.fandom.com/wiki/Sungka)). People play it on the floor, often on a
_banig_, the woven pandan mat whose two tones and coloured bands
([Wikipedia](https://en.wikipedia.org/wiki/Banig), [Field Museum](https://philippines.fieldmuseum.org/heritage/catalogue/1029762))
gave the page its background.

## What changed, and why

| Finding                        | Change                                                                                                                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long moves are the problem     | Each move gets a time budget instead of a fixed delay per shell. The first drops are slow enough to follow; later ones speed up. A 48-shell move now takes about 3.6 s instead of 7.4 s, the 137-shell move 5.2 s instead of 20.6 s. Tapping the board or pressing Space fast-forwards. |
| Players can't count relays     | The preview draws on the board: a bead on every pit the move will touch (one per shell), a mark where it relays, a ring where it lands, a chip saying what happens (_Isa pa!_, _Kain +9_), and the gain on your store.                                                                  |
| Phones have no hover           | First tap aims and shows the preview; a second tap on the same house sows. Mouse and keyboard still play on one click.                                                                                                                                                                  |
| Physical play is the fun       | Shells are scooped into a hand that glides from pit to pit and drops one at a time; each landing bounces the pit and knocks; captured shells fly to the store.                                                                                                                          |
| Effects should mean something  | Saffron is always you, rose is always the bot. The size of a capture sets the size of the shake and burst. Store drops climb in pitch within a move.                                                                                                                                    |
| The bot's move must be legible | Its row shimmers while it searches; the house it chose pulses before it plays.                                                                                                                                                                                                          |
| Turn and goal must be obvious  | Each player has a seat with a turn glow and a big banked count. A bar shows how the 98 shells are split, with a line at 50, the score that always wins.                                                                                                                                 |
| Tutorials should be played     | Five one-move lessons on real positions (sow, relay, capture, preview, finish). Each is checked against the engine in a unit test. The rules card has one sentence and one small drawing per rule.                                                                                      |
| Tap targets                    | On a portrait phone the board turns a quarter turn. Houses are drawn about 42 px across and their buttons are at least 44 px.                                                                                                                                                           |
| Motion settings                | Speed has four steps including instant. Reduced motion turns off shake, particles and ambient glow and starts at fast.                                                                                                                                                                  |

## Is it playable now?

Yes, with one honest caveat. The rules were never the problem; Sungka has been played for centuries
and the engine follows a documented variant. On a screen it needs three things a wooden board gives you
for free: you can see the shells move, you can feel the consequence, and you can check a move before
you make it. The redesign gives all three. The caveat is depth of interest: against Baguhan or Sakim a
player wins in a few minutes, and the jump to Matalino is steep. The next step worth testing with real
players is pass-and-play for two people on one device, which is how most Filipinos actually learned it.
