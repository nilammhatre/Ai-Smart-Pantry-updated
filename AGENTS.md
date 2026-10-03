<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- App state (pantry, shopping, notifications, history) lives in a React context persisted to localStorage (src/lib/pantry-store.tsx); AI scans and Pantry AI replies are simulated client-side — swap in Lovable Cloud + AI when real backend is needed.
