This is a Next.js demo project for an AI chat攻略 game.

## LLM Setup (Replicate + MODEL)

1. Create local env file:

```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` and set values:

```bash
OPENAI_API_KEY=YOUR_REAL_KEY
OPENAI_MODEL=anthropic/claude-4.5-sonnet
OPENAI_BASE_URL=https://api.replicate.com/v1
```

3. Restart dev server after env changes:

```bash
npm run dev
```

### Which file reads API KEY and MODEL?

- `src/lib/llm.ts` reads `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`.
- `src/app/api/chat/route.ts` calls the external LLM.

Note: `OPENAI_API_KEY` now expects a Replicate token (typically starts with `r8_`).

If API key is empty or external request fails, the app falls back to local rule-based reply generation.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
