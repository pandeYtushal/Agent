import { PortfolioChange, ProjectAnalysis } from '../models/index.js';
import { UserRepoCountInfo } from '../github/index.js';

export function formatRepoCountCard(data: UserRepoCountInfo): string {
  const pubText = data.publicRepos !== undefined ? `  • 🌐 *Public Repositories*: ${data.publicRepos}\n` : '';
  const privText = data.privateRepos !== undefined && data.privateRepos > 0 ? `  • 🔒 *Private Repositories*: ${data.privateRepos}\n` : '';

  let reposListText = '';
  if (data.repositories && data.repositories.length > 0) {
    const items = data.repositories.map((repo, i) => {
      const cleanDesc = repo.description ? repo.description.replace(/[_*`[\]()]/g, ' ').slice(0, 50) : '';
      const descPart = cleanDesc ? ` — _${cleanDesc}_` : '';
      const langPart = repo.language ? ` \`[${repo.language}]\`` : '';
      const lockPart = repo.isPrivate ? ' 🔒' : '';
      return `${i + 1}. [${repo.name}](${repo.htmlUrl})${lockPart}${langPart}${descPart}`;
    });
    reposListText = `\n📁 *Your Recent Repositories*:\n` + items.join('\n') + `\n`;
  }

  return (
    `📊 *GitHub Repository Overview*\n\n` +
    `👤 *Account*: \`${data.username}\`\n` +
    `📦 *Total Repositories*: *${data.totalCount}*\n` +
    pubText +
    privText +
    reposListText +
    `\n💡 *Tip*: Click any repo link above or send \`/add <repo-url>\` to publish it to your portfolio!`
  );
}

export function formatProgressMessage(stepIndex: number): string {
  const steps = [
    '🔍 Analyzing repository...',
    '✓ Repository found',
    '✓ README analyzed',
    '✓ Technologies detected',
    '✓ Live demo detected',
    '✓ Project assets detected',
    '✓ Portfolio structure analyzed',
  ];

  const completed = steps.slice(1, Math.min(stepIndex + 1, steps.length));
  return `🔍 *Analyzing Repository...*\n\n${completed.join('\n')}`;
}

export function formatNewProjectDetectedCard(projectName: string, description: string): string {
  return (
    `🚀 *New project detected*\n\n` +
    `*${projectName}*\n\n` +
    `${description}\n\n` +
    `I found a new GitHub project that isn't currently in your portfolio.`
  );
}

export function formatProjectReadyCard(
  analysis: ProjectAnalysis,
  change: PortfolioChange
): string {
  const newEntry = change.newEntry;
  const tech = (newEntry.fullTech as string[])?.join(', ') || 'TypeScript, Node.js';
  const features = (newEntry.keyPoints as string[])?.map((k) => `• ${k}`).join('\n') || '• Automated integration';
  const files = change.modifiedFiles.map((f) => f.path).concat(change.assetsToAdd.map((a) => a.targetPath));

  return (
    `✨ *PROJECT READY*\n\n` +
    `📌 *Title*: ${newEntry.title}\n` +
    `📝 *Description*: ${newEntry.description}\n\n` +
    `🛠 *Technologies*: ${tech}\n\n` +
    `⭐ *Key Features*:\n${features}\n\n` +
    `🔗 *GitHub*: [${newEntry.title}](${newEntry.source})\n` +
    `🌐 *Live Demo*: [${newEntry.urlDomain || 'View Deployment'}](${newEntry.link})\n` +
    `🖼 *Image*: \`${newEntry.image}\`\n\n` +
    `📂 *Files to change*:\n` +
    files.map((f) => `  - \`${f}\``).join('\n') +
    `\n\n⚙️ *Validation*:\n` +
    `  ✓ Build Check\n` +
    `  ✓ Typecheck\n` +
    `  ✓ Lint\n\n` +
    `_Select an action below to publish or manage this project entry._`
  );
}

export function formatPublishSuccessCard(
  projectName: string,
  prUrl: string,
  branchName: string,
  commitHash: string
): string {
  return (
    `🚀 *PUBLISHED TO GITHUB SUCCESSFUL!*\n\n` +
    `Project *${projectName}* has been processed, committed, and pushed.\n\n` +
    `🌿 *Branch*: \`${branchName}\`\n` +
    `💾 *Commit*: \`${commitHash.slice(0, 7)}\`\n` +
    `🔗 *Pull Request*: [View GitHub PR](${prUrl})\n\n` +
    `_Click the PR link above to review and merge your portfolio update!_`
  );
}

export function formatHelpMenu(): string {
  return (
    `🤖 *Portfolio Publishing Agent Bot*\n\n` +
    `I am your portfolio publishing assistant. I automate adding completed GitHub projects to your developer portfolio.\n\n` +
    `📌 *Available Commands*:\n` +
    `/repos - View total GitHub repositories count\n` +
    `/add - Start adding a new project repository\n` +
    `/projects - List current portfolio projects\n` +
    `/drafts - View active project drafts\n` +
    `/status - Check system & portfolio status\n` +
    `/help - Show this guide\n\n` +
    `💬 *Natural Language Support*:\n` +
    `You can also type:\n` +
    `• _"How many repos do I have?"_\n` +
    `• _"Add this project to my portfolio: https://github.com/..."_\n` +
    `• _"Update Hunter"_\n` +
    `• _"Show my drafts"_`
  );
}
