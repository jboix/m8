// Markdown formatting and link checks: `bun run docs:check`, `bun run docs:format`.
import remarkGfm from 'remark-gfm';
import remarkValidateLinks from 'remark-validate-links';

export default {
  settings: {
    bullet: '-',
    emphasis: '_',
    strong: '*',
    fence: '`',
    rule: '-',
    listItemIndent: 'one',
  },
  plugins: [
    remarkGfm,
    // `repository: false` keeps the check to links between files in this repo.
    // The plugin otherwise resolves them against the git remote, and there is no
    // remote yet. Drop the option once there is one, to check the GitHub links too.
    [remarkValidateLinks, { repository: false }],
  ],
};
