# ContribScope

Visualize the contribution breakdown of any public GitHub repository — no backend required.

## Features

- **Doughnut chart** — top 10 contributors + "Others" slice
- **Sorted list** — all contributors from most to least, with commit count and percentage bar
- **User search** — type a username to highlight and jump to their entry
- **Stats bar** — total commits, contributor count, top contributor name and share
- **Pagination** — fetches all pages from the GitHub API (handles repos with 100+ contributors)
- **Token support** — paste a personal access token to raise the rate limit from 60 to 5000 req/h

## Usage

Open `index.html` in any browser — no build step, no server needed.

1. Enter a repo in `owner/repo` format (or paste the full GitHub URL)
2. Optionally add a [GitHub personal access token](https://github.com/settings/tokens) (read-only, no scopes needed)
3. Click **Analyze**
4. Use the search box to look up a specific contributor

## GitHub API rate limits

| Mode          | Limit        |
|---------------|-------------|
| Unauthenticated | 60 req/h  |
| With token    | 5 000 req/h |

For repositories with many contributors, providing a token is recommended.

## Notes

- "Contributions" = commit count as reported by the GitHub API (`/repos/{owner}/{repo}/contributors`)
- Anonymous commits and bots that have a GitHub account are included
- Forked commits are **not** counted by GitHub's API
