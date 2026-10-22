import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewerApp } from '@/components/reviewer/ReviewerApp';
import { FixListChip } from '@/components/reviewer/FixListChip';
import './modern.css';
createRoot(document.getElementById('root')!).render(<StrictMode><header className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-5 sm:px-6"><a href="/" className="font-semibold text-ink">Product Page Reviewer</a><nav className="flex items-center gap-4 text-sm text-ink-2" aria-label="Application"><FixListChip /><a href="/classic/" className="hover:text-ink underline underline-offset-4">Classic</a></nav></header><ReviewerApp /></StrictMode>);
