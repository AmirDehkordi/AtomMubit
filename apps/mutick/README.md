# MuTick (UI)

Front end for the Night Shift hackathon project: an AI extracts headline numbers from earnings releases, checks catch its mistakes, an analyst fixes the rest, and Mubit learns from the corrected answers.

It runs on sample data until the backend is connected. All sample numbers are illustrative, and the UI says so. See `API.md` for the data contract.

## Run

```bash
npm install
npm run dev
```

Open the printed localhost address. `npm run build` type-checks and builds.

## Demo path (about 2 minutes)
1. **Start:** an empty screen with one text box. Click "Track NVIDIA".
2. **Pipeline:** the steps appear live: filing found, release read, fields extracted, arithmetic check finds 2 issues, SEC check waiting.
3. **Overview:** the company page from the Fundamentals Tracker: KPI row, quarterly fundamentals, price, earnings quality and capex intensity. "2 numbers need you" sits on top, and the flagged EPS is red in the KPI, the table and the trailing P/E. The first click in the page folds the chat to its icon rail.
4. **Fix:** click Fix on the EPS row, or the red cell. The fix panel slides in from the right over the Overview and asks which number is right. Press Enter (or 1) for the highlighted $1.17. The panel closes, EPS rolls from $1.24 to $1.17 with "Fixed", the card glows once, and the P/E updates.
5. **One wrong number spreads:** track Microsoft from the chat or "Track a company". Its flagged revenue ($281.7B, the twelve-month total) turns gross margin, FCF margin and the latest chart bars red until it is fixed.
6. **Before/After switch:** set the top bar to After. Learned values show in amber with the old value crossed out, and the top bar gives time and cost per release against before.
7. **Mubit button:** click "Mubit v2 · 10% of calls" in the top bar. A small panel shows the test accuracy of each version, and the examples count rolls up with "+1 from your fixes".

## Structure
- `src/api/types.ts`: the data contract
- `src/api/client.ts`: the only data module the UI calls (mock today)
- `src/api/mock/data.ts`, `mock/overview.ts`: sample data
- `src/lib/fundamentals.ts`: the Overview's metric rows, units and year-on-year rules
- `src/state/app.tsx`: screens, selection, corrections, learning mode, chat
- `src/components/start`, `shell`, `release`, `overview`, `review` (the fix card), `chat`: the screens
- `src/components/charts/chartTheme.tsx`: one chart style, matching the Fundamentals Tracker
- `src/components/ui`: shadcn/ui components
- `src/index.css`: design tokens (dark graphite, one amber accent)

## Keyboard in the fix panel
Enter picks the highlighted number, 1 to 9 pick a number, E types a value, K keeps the AI value (it asks why), Esc closes. Picking the AI's own number also asks why.
