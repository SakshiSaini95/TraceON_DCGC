# Setting up Tracy on Botpress (about 15 minutes)

Botpress needs your own account; the bot itself lives in your Botpress workspace. The website code is already wired up; you only supply the IDs. (Botpress renames menu items now and then, so labels may differ slightly.)

## 1. Create and train the bot
1. Sign in at botpress.com → **Create bot** → name it **Tracy**.
2. **Knowledge Base** → add `2-tracy-knowledge-base.md`. First replace every **[OWNER: fill in]** line with the real answer, or delete it so Tracy admits she doesn't know.
3. **Instructions / Autonomous Node** → paste the text from `1-tracy-instructions.md` and make sure the Knowledge Base is attached to that node.
4. Set the welcome message and quick replies from the bottom of the instructions file. Use `public/tracy-avatar.svg` as the bot avatar (convert to PNG if Studio asks).
5. In the **Emulator**, run every question in `3-test-questions.md`. When an answer is wrong, fix the Knowledge Base text (not the prompt) and re-test. This is how you "train" her: the more real Q&A you add to the KB, the better she answers.
6. **Publish** the bot.

## 2. Enable Webchat and copy IDs
1. Bot dashboard → **Webchat** → enable it.
2. Open **Advanced settings / Embed** and copy the **Bot ID** (and **Client ID** if your embed uses webchat v3).
3. Check the inject script version in the embed code. If it isn't v2.2, set `VITE_BOTPRESS_INJECT_URL` to the URL shown there.

## 3. Connect the site
```
cp .env.example .env
# fill in
VITE_BOTPRESS_BOT_ID=...
VITE_BOTPRESS_CLIENT_ID=...   # only if webchat v3
```
Then `npm run dev` (or rebuild and redeploy). On the host (Vercel/Netlify/etc.) add the same variables, because Vite reads them at build time.

If you're allow-listing domains in Botpress webchat settings, add your production domain.

## What the code does
- `src/components/TracyChat.tsx` loads Botpress lazily, hides Botpress's default bubble, and shows a themed "ASK TRACY" launcher with the mascot face, a one-time greeting nudge, and open/close sync.
- With no Bot ID, nothing renders in production. In dev, a small hint appears.
- Webchat colour is set to the site's lime; avatar is served from `/tracy-avatar.svg`.

## Keeping her sharp
- Review Botpress **Conversations** weekly; add every question she missed to the KB as a Q/A pair.
- Update the KB when the product changes (pricing, platforms, launch), and republish.
